package com.kidiplus.app

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.SurfaceTexture
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.Surface
import android.view.TextureView
import android.view.ViewGroup
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.snap.camerakit.ImageProcessor
import com.snap.camerakit.Session
import com.snap.camerakit.invoke
import com.snap.camerakit.lenses.LensesComponent
import com.snap.camerakit.lenses.whenHasFirst
import com.snap.camerakit.support.camerax.CameraXImageProcessorSource
import com.snap.camerakit.supported
import io.livekit.android.LiveKit
import io.livekit.android.room.Room
import io.livekit.android.room.participant.VideoTrackPublishOptions
import io.livekit.android.room.track.LocalVideoTrack
import io.livekit.android.room.track.LocalVideoTrackOptions
import io.livekit.android.room.track.VideoCaptureParameter
import io.livekit.android.room.track.VideoEncoding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import livekit.org.webrtc.CapturerObserver
import livekit.org.webrtc.SurfaceTextureHelper
import livekit.org.webrtc.VideoCapturer
import livekit.org.webrtc.VideoFrame
import java.io.Closeable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

/**
 * Snap Camera Kit (native) + LiveKit publisher for Capacitor Android.
 *
 * Clean-room rebuild. Design rules, each one earned from a previous black-screen
 * regression:
 *
 *  1. ONE camera pipeline: CameraX -> Camera Kit session -> outputs.
 *     Outputs are (a) a TextureView for local display and (b) a LiveKit
 *     external video capturer. The WebView LiveKit SDK never opens the camera
 *     while this plugin is publishing.
 *  2. Display uses a **TextureView**, not a SurfaceView: it composites inside
 *     the normal view hierarchy, so no separate-window z-order fights and no
 *     need to make the activity window background transparent.
 *  3. Every session/view/CameraX call runs on the MAIN thread. Capacitor calls
 *     plugin methods on a background thread; binding CameraX there produced a
 *     silent zero-frame camera.
 *  4. The WebView is only made transparent AFTER a real Camera Kit frame has
 *     been rendered (TextureView.onSurfaceTextureUpdated). Never reveal an
 *     empty surface.
 *  5. A watchdog verifies frames keep flowing. No frames for >3s after start or
 *     after applying a lens -> clear the lens, notify JS ("fallback" event) so
 *     the web layer reverts to the raw camera. The live must never stay black.
 *
 * API token: read from AndroidManifest meta-data `com.snap.camerakit.api.token`
 * (JS may also pass `apiToken`, which wins if present).
 */
@CapacitorPlugin(name = "KidiCameraKit")
class KidiCameraKitPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    /** Serializes session creation / preview start. */
    private val lock = Any()

    private var session: Session? = null
    private var imageSource: CameraXImageProcessorSource? = null
    private var groupIds: List<String> = emptyList()
    private var initialized = false

    // Preview (display) state
    private var previewView: TextureView? = null
    private var previewOutput: Closeable? = null
    private var previewRequested = false
    private var previewStarted = false
    private var previewStarting = false
    private val previewCallbacks = mutableListOf<(Boolean) -> Unit>()
    private var facingFront = true
    private var webViewTransparent = false

    // Lens state
    private var cachedLenses: List<JSObject> = emptyList()
    private val lensByKey = mutableMapOf<String, LensesComponent.Lens>()
    private var lensObserve: Closeable? = null
    private var currentLensKey: String? = null

    // Frame health (any output: preview or LiveKit)
    private val frameCount = AtomicLong(0)
    private val lastFrameAt = AtomicLong(0)
    private var watchdog: Job? = null

    // LiveKit publication
    private var liveKitRoom: Room? = null
    private var liveKitTrack: LocalVideoTrack? = null
    private var publishCapturer: CameraKitSurfaceCapturer? = null
    private var publishOutput: Closeable? = null
    private var publishEnabled = false

    // Adaptive capture profile (Camera Kit output size + publish encoding).
    private var profileIndex = 0
    private var adaptiveJob: Job? = null

    override fun load() {
        Log.i(TAG, "plugin loaded")
        notifyListeners("pluginLoaded", JSObject().put("ready", true))
    }

    // ---------------------------------------------------------------- status

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val act = activity
        val ok = act != null && supported(act) && resolveToken(null).isNotEmpty()
        call.resolve(
            JSObject()
                .put("available", ok)
                .put("supported", act != null && supported(act))
                .put("hasToken", resolveToken(null).isNotEmpty()),
        )
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val last = lastFrameAt.get()
        call.resolve(
            JSObject()
                .put("ready", true)
                .put("initialized", initialized)
                .put("sessionStarted", previewStarted)
                .put("captureRunning", previewStarted)
                .put("publishing", publishEnabled)
                .put("frameCount", frameCount.get())
                .put("lastFrameAgeMs", if (last > 0) SystemClock.elapsedRealtime() - last else 0)
                .put("lensId", currentLensKey?.substringAfter('|').orEmpty()),
        )
    }

    // ------------------------------------------------------------ initialize

    @PluginMethod
    fun initialize(call: PluginCall) {
        val token = resolveToken(call.getString("apiToken"))
        if (token.isEmpty()) {
            call.reject("Missing Camera Kit API token (JS apiToken or manifest meta-data com.snap.camerakit.api.token)")
            return
        }
        val ids = call.getArray("groupIds")?.toStringList().orEmpty()
        if (ids.isEmpty()) {
            call.reject("Missing groupIds")
            return
        }
        val act = activity
        if (act == null) {
            call.reject("Activity unavailable")
            return
        }
        if (!supported(act)) {
            call.reject("Camera Kit is not supported on this device")
            return
        }

        groupIds = ids
        synchronized(lock) {
            if (session == null) {
                try {
                    // Session creation touches the view hierarchy internally →
                    // main thread only (CalledFromWrongThreadException otherwise).
                    runOnUiBlocking {
                        val source = CameraXImageProcessorSource(
                            context = act,
                            lifecycleOwner = act as LifecycleOwner,
                        )
                        imageSource = source
                        // No attachTo(): we own the rendering (TextureView) and
                        // the LiveKit output. Camera Kit's bundled CameraLayout
                        // uses a SurfaceView, which is what caused the
                        // separate-window black-screen composition bugs.
                        session = Session(context = act) {
                            apiToken(token)
                            imageProcessorSource(source)
                        }
                    }
                } catch (t: Throwable) {
                    Log.e(TAG, "session create failed", t)
                    cleanupSession()
                    call.reject("Camera Kit init failed: ${t.message}")
                    return
                }
            }
        }
        initialized = true
        Log.i(TAG, "initialized groups=${ids.joinToString(",")}")
        emit("initialized", JSObject().put("groups", ids.joinToString(",")))
        call.resolve(JSObject().put("initialized", true))
    }

    // ---------------------------------------------------------------- lenses

    @PluginMethod
    fun loadLenses(call: PluginCall) {
        val s = session
        if (!initialized || s == null) {
            call.reject("CameraKit not initialized — call initialize() first")
            return
        }
        val ids = call.getArray("groupIds")?.toStringList() ?: groupIds
        if (ids.isEmpty()) {
            call.reject("Missing groupIds")
            return
        }
        groupIds = ids
        var resolved = false
        fun finish(list: List<JSObject>) {
            if (resolved) return
            resolved = true
            val arr = JSArray()
            list.forEach { arr.put(it) }
            if (!call.isReleased) call.resolve(JSObject().put("lenses", arr))
        }
        lensObserve?.close()
        lensObserve = s.lenses.repository.observe(
            LensesComponent.Repository.QueryCriteria.Available(ids.toSet()),
        ) { result ->
            if (result is LensesComponent.Repository.Result.Some) {
                cachedLenses = result.lenses.map { lens ->
                    lensByKey[key(lens.id, lens.groupId)] = lens
                    lens.toJs()
                }
                finish(cachedLenses)
            }
        }
        // Never hang the carousel: resolve with whatever we have after 8s.
        postDelayed(8_000) { finish(cachedLenses) }
    }

    @PluginMethod
    fun applyLens(call: PluginCall) {
        val s = session
        if (!initialized || s == null) {
            call.reject("CameraKit not initialized")
            return
        }
        val lensId = call.getString("lensId").orEmpty()
        if (lensId.isEmpty()) {
            call.reject("Missing lensId")
            return
        }
        val groupId = call.getString("groupId").orEmpty().ifEmpty { groupIds.firstOrNull().orEmpty() }
        previewRequested = true
        ensurePreview { ok ->
            if (!ok) {
                call.reject("Camera preview failed to start")
                return@ensurePreview
            }
            val baseline = frameCount.get()
            val apply: (LensesComponent.Lens) -> Unit = { lens ->
                s.lenses.processor.apply(lens) { applied ->
                    if (!applied) {
                        Log.w(TAG, "lens apply rejected id=$lensId")
                        if (!call.isReleased) call.reject("Failed to apply lens")
                        return@apply
                    }
                    currentLensKey = key(lens.id, lens.groupId)
                    // Only report success once real frames come out of the lens.
                    scope.launch {
                        if (awaitFrames(baseline, LENS_FRAME_TIMEOUT_MS)) {
                            if (!call.isReleased) {
                                call.resolve(
                                    JSObject()
                                        .put("applied", true)
                                        .put("frameCount", frameCount.get()),
                                )
                            }
                        } else {
                            Log.e(TAG, "lens produced no frame — reverting")
                            revertToRawCamera("lens_no_frame")
                            if (!call.isReleased) call.reject("Lens produced no video frame")
                        }
                    }
                }
            }
            val cached = lensByKey[key(lensId, groupId)]
            if (cached != null) {
                apply(cached)
                return@ensurePreview
            }
            s.lenses.repository.observe(
                LensesComponent.Repository.QueryCriteria.ById(lensId, groupId),
            ) { result ->
                result.whenHasFirst { lens ->
                    lensByKey[key(lens.id, lens.groupId)] = lens
                    apply(lens)
                }
            }
        }
    }

    @PluginMethod
    fun clearLens(call: PluginCall) {
        currentLensKey = null
        val processor = session?.lenses?.processor
        if (processor == null) {
            call.resolve(JSObject().put("cleared", true))
            return
        }
        processor.clear { if (!call.isReleased) call.resolve(JSObject().put("cleared", true)) }
    }

    // --------------------------------------------------------------- preview

    @PluginMethod
    fun startPreview(call: PluginCall) {
        facingFront = (call.getString("facing") ?: "user") != "environment"
        val group = call.getString("lensGroupId")
        if (!group.isNullOrEmpty() && !groupIds.contains(group)) {
            groupIds = groupIds + group
        }
        previewRequested = true
        ensurePreview { ok ->
            if (!ok) {
                call.reject("Camera preview failed to start")
                return@ensurePreview
            }
            emit("previewStarted", JSObject().put("facingFront", facingFront))
            notifyListeners("captureState", JSObject().put("running", true))
            call.resolve(JSObject().put("started", true))
        }
    }

    @PluginMethod
    fun stopPreview(call: PluginCall) {
        if (publishEnabled) {
            // The preview surface is also the publisher's input; report honestly
            // instead of pretending the camera was released.
            call.resolve(JSObject().put("stopped", false).put("reason", "publishing"))
            return
        }
        previewRequested = false
        teardownPreview {
            if (!call.isReleased) call.resolve(JSObject().put("stopped", true))
        }
    }

    @PluginMethod
    fun flipCamera(call: PluginCall) {
        if (!previewStarted) {
            call.reject("Preview is not running")
            return
        }
        facingFront = !facingFront
        val source = imageSource
        if (source == null) {
            call.reject("Camera source unavailable")
            return
        }
        val baseline = frameCount.get()
        runOnUi {
            try {
                // Same pipeline, different CameraX selector.
                source.startPreview(facingFront)
            } catch (e: Exception) {
                Log.e(TAG, "flipCamera failed", e)
                if (!call.isReleased) call.reject("Flip failed: ${e.message}")
                return@runOnUi
            }
            scope.launch {
                val ok = awaitFrames(baseline, START_FRAME_TIMEOUT_MS)
                if (!ok) revertToRawCamera("flip_no_frame")
                if (!call.isReleased) {
                    if (ok) {
                        call.resolve(
                            JSObject()
                                .put("flipped", true)
                                .put("facing", if (facingFront) "user" else "environment"),
                        )
                    } else {
                        call.reject("Camera produced no frame after flip")
                    }
                }
            }
        }
    }

    // ------------------------------------------------------------ publishing

    @PluginMethod
    fun setPublishEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled", false) == true
        if (!enabled) {
            scope.launch {
                stopPublishing()
                call.resolve(JSObject().put("enabled", false))
            }
            return
        }
        val roomUrl = call.getString("roomUrl").orEmpty()
        val token = call.getString("token").orEmpty()
        if (roomUrl.isEmpty() || token.isEmpty()) {
            call.reject("Missing roomUrl or token")
            return
        }
        scope.launch {
            try {
                startPublishing(roomUrl, token)
                call.resolve(JSObject().put("enabled", true))
            } catch (e: Exception) {
                Log.e(TAG, "setPublishEnabled failed", e)
                stopPublishing()
                call.reject("Publish failed: ${e.message}")
            }
        }
    }

    private suspend fun startPublishing(url: String, token: String) {
        publishEnabled = true
        previewRequested = true
        val act = activity ?: throw IllegalStateException("no activity")
        val s = session ?: throw IllegalStateException("Camera Kit session missing")

        var done = false
        var ok = false
        ensurePreview { result -> done = true; ok = result }
        var waited = 0
        while (!done && waited < 100) {
            delay(50)
            waited++
        }
        if (!ok) {
            publishEnabled = false
            throw IllegalStateException("Camera preview failed to start — refusing to publish black frames")
        }

        val room = liveKitRoom ?: LiveKit.create(act.applicationContext)
        liveKitRoom = room
        room.connect(url, token)

        val baseline = frameCount.get()
        val capturer = CameraKitSurfaceCapturer(
            session = s,
            onConnected = { handle -> publishOutput = handle },
            onFrame = { onFrame() },
        )
        val track = room.localParticipant.createVideoTrack(name = "camera", capturer = capturer)
        liveKitTrack = track
        // publishVideoTrack() does not start an external capturer; without this
        // no frame ever reaches LiveKit ("no video frame within 5000ms").
        track.startCapture()
        room.localParticipant.publishVideoTrack(track)
        if (!awaitFrames(baseline, PUBLISH_FRAME_TIMEOUT_MS)) {
            throw IllegalStateException("Camera Kit produced no published frame")
        }
        try {
            room.localParticipant.setMicrophoneEnabled(true)
        } catch (e: Exception) {
            Log.w(TAG, "mic publish failed", e)
        }
        Log.i(TAG, "LiveKit video published")
    }

    private suspend fun stopPublishing() {
        publishEnabled = false
        publishOutput?.close()
        publishOutput = null
        runCatching { liveKitTrack?.stopCapture() }
        runCatching { liveKitTrack?.stop() }
        liveKitTrack = null
        runCatching { liveKitRoom?.disconnect() }
        liveKitRoom = null
        if (!previewRequested) teardownPreview {}
        Log.i(TAG, "LiveKit publish stopped")
    }

    // ------------------------------------------------------------- lifecycle

    override fun handleOnStop() {
        super.handleOnStop()
        if (!previewRequested && !publishEnabled) return
        // CameraX is lifecycle-bound: use-cases are dropped when the activity
        // stops. Drop `previewStarted` so resume rebinds instead of trusting a
        // frozen frame.
        previewStarted = false
        previewStarting = false
        stopWatchdog()
        runOnUi { runCatching { imageSource?.stopPreview() } }
        Log.i(TAG, "activity stopped; preview marked for rebind")
    }

    override fun handleOnResume() {
        super.handleOnResume()
        if (!initialized || (!previewRequested && !publishEnabled)) return
        Log.i(TAG, "activity resumed; rebinding preview")
        ensurePreview { ok ->
            if (ok) emit("previewResumed") else revertToRawCamera("resume_failed")
        }
    }

    override fun handleOnDestroy() {
        lensObserve?.close()
        lensObserve = null
        stopWatchdog()
        runCatching { kotlinx.coroutines.runBlocking { stopPublishing() } }
        teardownPreviewSync()
        cleanupSession()
        scope.cancel()
        super.handleOnDestroy()
    }

    private fun cleanupSession() {
        runCatching { session?.close() }
        session = null
        imageSource = null
        initialized = false
    }

    // ------------------------------------------------------- preview plumbing

    private fun ensurePreview(done: (ok: Boolean) -> Unit) {
        val act = activity
        val source = imageSource
        if (act == null || source == null) {
            done(false)
            return
        }
        synchronized(lock) {
            if (previewStarted) {
                done(true)
                return
            }
            previewCallbacks.add(done)
            if (previewStarting) return
            previewStarting = true
        }

        val start = {
            runOnUi {
                if (previewStarted) {
                    finishPreview(true)
                    return@runOnUi
                }
                attachPreviewView()
                // CameraXImageProcessorSource can leave stale use-cases bound;
                // unbind and let the camera service close before rebinding.
                forceReleaseCameraX {
                    try {
                        source.startPreview(facingFront)
                        previewStarted = true
                        startWatchdog()
                        finishPreview(true)
                    } catch (e: Exception) {
                        Log.e(TAG, "startPreview failed", e)
                        finishPreview(false)
                    }
                }
            }
        }

        if (ContextCompat.checkSelfPermission(act, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED
        ) {
            start()
        } else {
            ActivityCompat.requestPermissions(
                act,
                arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO),
                REQ_CAMERA,
            )
            postDelayed(500) { start() }
        }
    }

    private fun finishPreview(ok: Boolean) {
        val callbacks = synchronized(lock) {
            previewStarted = ok
            previewStarting = false
            previewCallbacks.toList().also { previewCallbacks.clear() }
        }
        callbacks.forEach { cb -> runCatching { cb(ok) } }
    }

    /** Inserts the TextureView BEHIND the WebView (index 0) and connects it as
     * a Camera Kit preview output as soon as its SurfaceTexture exists. */
    private fun attachPreviewView() {
        if (previewView != null) return
        val act = activity ?: return
        val parent = (bridge?.webView?.parent as? ViewGroup)
            ?: act.findViewById(android.R.id.content)
        val view = TextureView(act).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            isOpaque = true
            surfaceTextureListener = object : TextureView.SurfaceTextureListener {
                override fun onSurfaceTextureAvailable(st: SurfaceTexture, w: Int, h: Int) {
                    connectPreviewOutput(st)
                }

                override fun onSurfaceTextureSizeChanged(st: SurfaceTexture, w: Int, h: Int) = Unit

                override fun onSurfaceTextureDestroyed(st: SurfaceTexture): Boolean {
                    previewOutput?.close()
                    previewOutput = null
                    return true
                }

                override fun onSurfaceTextureUpdated(st: SurfaceTexture) {
                    onFrame()
                }
            }
        }
        previewView = view
        parent.addView(view, 0)
    }

    private fun connectPreviewOutput(texture: SurfaceTexture) {
        val s = session ?: return
        previewOutput?.close()
        val surface = Surface(texture)
        previewOutput = runCatching {
            s.processor.connectOutput(
                object : ImageProcessor.Output.BackedBySurface(
                    surface,
                    ImageProcessor.Output.Purpose.PREVIEW,
                ) {
                    override fun writeFrame(): ImageProcessor.Output.Frame =
                        object : ImageProcessor.Output.Frame {
                            override val timestamp: Long = SystemClock.elapsedRealtimeNanos()
                            override fun recycle() = Unit
                        }
                },
            )
        }.onFailure { Log.e(TAG, "preview output connect failed", it) }.getOrNull()
        Log.i(TAG, "preview output connected=${previewOutput != null}")
    }

    private fun teardownPreview(done: () -> Unit) {
        previewStarted = false
        previewStarting = false
        stopWatchdog()
        runOnUi {
            teardownPreviewSync()
            forceReleaseCameraX { done() }
        }
    }

    private fun teardownPreviewSync() {
        runCatching { imageSource?.stopPreview() }
        previewOutput?.close()
        previewOutput = null
        runOnUi {
            previewView?.let { view ->
                (view.parent as? ViewGroup)?.removeView(view)
            }
            previewView = null
            restoreWebViewBackground()
        }
    }

    // --------------------------------------------------------- frame watchdog

    private fun onFrame() {
        val count = frameCount.incrementAndGet()
        lastFrameAt.set(SystemClock.elapsedRealtime())
        // Re-assert transparency on EVERY (re)start, not only on the very first
        // frame of the app session. The setup -> live transition tears the
        // preview view down and restores the WebView background; keying the
        // reveal on `count == 1` meant the second start kept an opaque WebView
        // over a perfectly healthy Camera Kit surface (the "black screen after
        // Lancer le live" bug).
        if (!webViewTransparent && previewView != null) {
            Log.i(TAG, "Camera Kit frame flowing (count=$count) — revealing preview")
            makeWebViewTransparent()
            if (count == 1L) {
                notifyListeners("firstFrame", JSObject().put("frameCount", count))
            }
        }
    }


    private fun startWatchdog() {
        stopWatchdog()
        lastFrameAt.set(SystemClock.elapsedRealtime())
        watchdog = scope.launch {
            // Grace period for the first frame after a (re)bind.
            delay(START_FRAME_TIMEOUT_MS)
            while (previewStarted || publishEnabled) {
                val age = SystemClock.elapsedRealtime() - lastFrameAt.get()
                if (age > STALL_TIMEOUT_MS) {
                    Log.e(TAG, "no Camera Kit frame for ${age}ms — falling back")
                    revertToRawCamera("stalled")
                    return@launch
                }
                delay(1_000)
            }
        }
    }

    private fun stopWatchdog() {
        watchdog?.cancel()
        watchdog = null
    }

    /** Clears the lens, hides the native surface and tells JS to go back to the
     * plain LiveKit camera. Never leaves the host on a black screen. */
    private fun revertToRawCamera(reason: String) {
        Log.w(TAG, "revertToRawCamera reason=$reason")
        currentLensKey = null
        runCatching { session?.lenses?.processor?.clear {} }
        stopWatchdog()
        runOnUi { restoreWebViewBackground() }
        notifyListeners("fallback", JSObject().put("reason", reason))
    }

    // --------------------------------------------------------- view utilities

    private fun makeWebViewTransparent() {
        runOnUi {
            if (webViewTransparent) return@runOnUi
            webViewTransparent = true
            val webView = bridge?.webView ?: return@runOnUi
            webView.setBackgroundColor(Color.TRANSPARENT)
            (webView.parent as? ViewGroup)?.setBackgroundColor(Color.TRANSPARENT)
            // NOTE: with a TextureView the activity window background must stay
            // as it is — no window-level transparency hacks needed.
        }
    }

    private fun restoreWebViewBackground() {
        runOnUi {
            if (!webViewTransparent) return@runOnUi
            webViewTransparent = false
            val webView = bridge?.webView ?: return@runOnUi
            webView.setBackgroundColor(APP_BACKGROUND)
            (webView.parent as? ViewGroup)?.setBackgroundColor(APP_BACKGROUND)
        }
    }

    private fun forceReleaseCameraX(done: () -> Unit) {
        val act = activity
        if (act == null) {
            done()
            return
        }
        runOnUi {
            try {
                val future = ProcessCameraProvider.getInstance(act)
                future.addListener({
                    runCatching { future.get().unbindAll() }
                        .onFailure { Log.w(TAG, "CameraX unbindAll failed", it) }
                    postDelayed(CAMERA_X_RELEASE_DELAY_MS) { done() }
                }, ContextCompat.getMainExecutor(act))
            } catch (e: Exception) {
                Log.w(TAG, "CameraX provider unavailable", e)
                postDelayed(CAMERA_X_RELEASE_DELAY_MS) { done() }
            }
        }
    }

    private fun runOnUi(task: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) task() else activity?.runOnUiThread(task)
    }

    private fun <T> runOnUiBlocking(task: () -> T): T {
        if (Looper.myLooper() == Looper.getMainLooper()) return task()
        val act = activity ?: throw IllegalStateException("no activity")
        val latch = CountDownLatch(1)
        var result: Result<T>? = null
        act.runOnUiThread {
            result = runCatching(task)
            latch.countDown()
        }
        latch.await(10, TimeUnit.SECONDS)
        return result?.getOrThrow()
            ?: throw IllegalStateException("UI thread did not run Camera Kit task in time")
    }

    private fun postDelayed(delayMs: Long, task: () -> Unit) {
        activity?.window?.decorView?.postDelayed(task, delayMs)
    }

    private suspend fun awaitFrames(baseline: Long, timeoutMs: Long): Boolean {
        val deadline = SystemClock.elapsedRealtime() + timeoutMs
        while (SystemClock.elapsedRealtime() < deadline) {
            if (frameCount.get() > baseline) return true
            delay(50)
        }
        return false
    }

    /** JS token wins; otherwise the manifest meta-data value. */
    private fun resolveToken(fromJs: String?): String {
        if (!fromJs.isNullOrBlank()) return fromJs
        val act = activity ?: return ""
        return try {
            val info = act.packageManager.getApplicationInfo(
                act.packageName,
                PackageManager.GET_META_DATA,
            )
            info.metaData?.getString(META_TOKEN)?.trim().orEmpty()
        } catch (e: Exception) {
            Log.w(TAG, "manifest token lookup failed", e)
            ""
        }
    }

    private fun key(id: String, groupId: String) = "$groupId|$id"

    private fun LensesComponent.Lens.toJs(): JSObject {
        val obj = JSObject()
        obj.put("id", id)
        obj.put("groupId", groupId)
        obj.put("name", name.orEmpty().ifBlank { "Lens" })
        icons.firstOrNull()?.uri?.toString()?.takeIf { it.isNotEmpty() }?.let { obj.put("iconUrl", it) }
        return obj
    }

    private fun JSArray.toStringList(): List<String> {
        val out = ArrayList<String>()
        for (i in 0 until length()) {
            val value = optString(i, "")
            if (value.isNotEmpty()) out.add(value)
        }
        return out
    }

    private fun emit(phase: String, extra: JSObject? = null) {
        val data = JSObject()
            .put("phase", phase)
            .put("initialized", initialized)
            .put("sessionStarted", previewStarted)
            .put("captureRunning", previewStarted)
        extra?.keys()?.forEach { k -> data.put(k, extra.get(k)) }
        notifyListeners("status", data)
    }

    companion object {
        private const val TAG = "KidiCameraKit"
        private const val META_TOKEN = "com.snap.camerakit.api.token"
        private const val REQ_CAMERA = 4921
        private const val CAMERA_X_RELEASE_DELAY_MS = 700L
        private const val START_FRAME_TIMEOUT_MS = 3_000L
        private const val LENS_FRAME_TIMEOUT_MS = 3_000L
        private const val PUBLISH_FRAME_TIMEOUT_MS = 5_000L
        private const val STALL_TIMEOUT_MS = 3_000L
        private val APP_BACKGROUND = Color.parseColor("#10162B")
    }
}

/**
 * Pushes Camera Kit's filtered frames into LiveKit as an external video track.
 * Mirrors the iOS bridge (KidiCameraKitLiveKitOutput.swift): Camera Kit output
 * surface -> WebRTC SurfaceTextureHelper -> LiveKit capturer observer.
 */
private class CameraKitSurfaceCapturer(
    private val session: Session,
    private val onConnected: (Closeable) -> Unit,
    private val onFrame: () -> Unit,
) : VideoCapturer {
    private var helper: SurfaceTextureHelper? = null
    private var observer: CapturerObserver? = null
    private var surface: Surface? = null
    private var output: Closeable? = null
    private var framesSeen = 0L

    override fun initialize(
        helper: SurfaceTextureHelper,
        context: android.content.Context,
        observer: CapturerObserver,
    ) {
        this.helper = helper
        this.observer = observer
    }

    override fun startCapture(width: Int, height: Int, framerate: Int) {
        val helper = this.helper
        if (helper == null) {
            Log.e("KidiCameraKit", "capturer startCapture before initialize()")
            observer?.onCapturerStarted(false)
            return
        }
        Log.i("KidiCameraKit", "capturer startCapture ${width}x${height}@$framerate")
        helper.setTextureSize(width.coerceAtLeast(640), height.coerceAtLeast(480))
        helper.startListening { frame: VideoFrame ->
            framesSeen++
            if (framesSeen == 1L) Log.i("KidiCameraKit", "first frame delivered to LiveKit")
            onFrame()
            observer?.onFrameCaptured(frame)
        }
        val surface = Surface(helper.surfaceTexture)
        this.surface = surface
        val connected = session.processor.connectOutput(
            object : ImageProcessor.Output.BackedBySurface(
                surface,
                ImageProcessor.Output.Purpose.RECORDING,
            ) {
                override fun writeFrame(): ImageProcessor.Output.Frame =
                    object : ImageProcessor.Output.Frame {
                        override val timestamp: Long = SystemClock.elapsedRealtimeNanos()
                        override fun recycle() = Unit
                    }
            },
        )
        output = connected
        onConnected(connected)
        observer?.onCapturerStarted(true)
    }

    override fun stopCapture() {
        Log.i("KidiCameraKit", "capturer stopCapture after $framesSeen frames")
        framesSeen = 0L
        output?.close()
        output = null
        surface?.release()
        surface = null
        helper?.stopListening()
        observer?.onCapturerStopped()
    }

    override fun changeCaptureFormat(width: Int, height: Int, framerate: Int) = Unit

    override fun dispose() {
        stopCapture()
    }

    override fun isScreencast(): Boolean = false
}
