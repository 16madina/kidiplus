package com.kidiplus.app

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.Surface
import android.view.ViewGroup
import android.view.ViewStub
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.camera.lifecycle.ProcessCameraProvider
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
import io.livekit.android.room.track.LocalVideoTrack
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
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
 * Native Snap Camera Kit + LiveKit publisher for Capacitor Android.
 * Mirrors ios/App/App/KidiCameraKitPlugin.swift.
 */
@CapacitorPlugin(name = "KidiCameraKit")
class KidiCameraKitPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    // Serializes session creation — the JS warmup calls initialize() twice
    // concurrently, and a double Session would make two CameraX sources fight
    // over the camera.
    private val sessionLock = Any()

    private var cameraKitSession: Session? = null
    private var imageSource: CameraXImageProcessorSource? = null
    private var groupIds: List<String> = emptyList()
    private var initialized = false
    private var previewStarted = false
    private var previewRequested = false
    private var previewStarting = false
    private val previewStartCallbacks = mutableListOf<(Boolean) -> Unit>()
    private var facingFront = true

    private var cachedLenses: List<JSObject> = emptyList()
    private var lensByKey: MutableMap<String, LensesComponent.Lens> = mutableMapOf()
    private var observeHandle: Closeable? = null

    private var liveKitRoom: Room? = null
    private var liveKitTrack: LocalVideoTrack? = null
    private var publishOutput: Closeable? = null
    private var publishEnabled = false
    private val publishedFrameCount = AtomicLong(0)
    private val lastPublishedFrameAt = AtomicLong(0)
    private val lensApplyGeneration = AtomicLong(0)

    override fun load() {
        Log.i(TAG, "plugin loaded")
        val payload = JSObject().put("ready", true)
        notifyListeners("pluginLoaded", payload)
        activity?.window?.decorView?.postDelayed({
            notifyListeners("pluginLoaded", payload)
        }, 600)
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val lastFrameAt = lastPublishedFrameAt.get()
        call.resolve(
            JSObject()
                .put("ready", true)
                .put("initialized", initialized)
                .put("sessionStarted", previewStarted)
                .put("captureRunning", previewStarted)
                .put("publishing", publishEnabled)
                .put("frameCount", publishedFrameCount.get())
                .put(
                    "lastFrameAgeMs",
                    if (lastFrameAt > 0) SystemClock.elapsedRealtime() - lastFrameAt else 0,
                )
        )
    }

    @PluginMethod
    fun initialize(call: PluginCall) {
        val apiToken = call.getString("apiToken").orEmpty()
        if (apiToken.isEmpty()) {
            call.reject("Missing apiToken")
            return
        }
        val ids = call.getArray("groupIds")?.toStringList().orEmpty()
        if (ids.isEmpty()) {
            call.reject("Missing groupIds")
            return
        }

        val activity = activity
        if (activity == null) {
            call.reject("Activity unavailable")
            return
        }
        if (!supported(activity)) {
            call.reject("Camera Kit is not supported on this device")
            return
        }

        groupIds = ids
        synchronized(sessionLock) {
            if (cameraKitSession == null) {
                try {
                    // Session's attachTo() adds a ViewStub to the view hierarchy,
                    // which MUST happen on the main thread. Capacitor dispatches
                    // plugin calls on a HandlerThread — creating the session here
                    // crashed the app with CalledFromWrongThreadException.
                    runOnUiBlocking {
                        val source = CameraXImageProcessorSource(
                            context = activity,
                            lifecycleOwner = activity as LifecycleOwner,
                        )
                        imageSource = source
                        cameraKitSession = Session(context = activity) {
                            apiToken(apiToken)
                            imageProcessorSource(source)
                            attachTo(ensureStub())
                        }
                    }
                } catch (t: Throwable) {
                    Log.e(TAG, "session create failed", t)
                    call.reject("Camera Kit init failed: ${t.message}")
                    return
                }
            }
        }
        initialized = true
        Log.i(TAG, "initialized groups=${ids.joinToString(",")}")
        emitStatus("initialized", JSObject().put("groups", ids.joinToString(",")))
        call.resolve(JSObject().put("initialized", true))
    }

    @PluginMethod
    fun loadLenses(call: PluginCall) {
        val session = cameraKitSession
        if (!initialized || session == null) {
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
            val payload = JSArray()
            list.forEach { payload.put(it) }
            if (!call.isReleased) {
                call.resolve(JSObject().put("lenses", payload))
            }
        }
        observeHandle?.close()
        observeHandle = session.lenses.repository.observe(
            LensesComponent.Repository.QueryCriteria.Available(ids.toSet()),
        ) { result ->
            if (result is LensesComponent.Repository.Result.Some) {
                cachedLenses = result.lenses.map { lens ->
                    lensByKey[lensKey(lens.id, lens.groupId)] = lens
                    lens.toJs()
                }
                finish(cachedLenses)
            }
        }
        activity?.window?.decorView?.postDelayed({
            finish(cachedLenses)
        }, 8_000)
    }

    @PluginMethod
    fun applyLens(call: PluginCall) {
        val generation = lensApplyGeneration.incrementAndGet()
        val session = cameraKitSession
        if (!initialized || session == null) {
            call.reject("CameraKit not initialized")
            return
        }
        val lensId = call.getString("lensId").orEmpty()
        if (lensId.isEmpty()) {
            call.reject("Missing lensId")
            return
        }
        val groupId = call.getString("groupId").orEmpty()
        previewRequested = true
        ensurePreviewStarted { previewOk ->
            if (!previewOk) {
                call.reject("Camera preview failed to start")
                return@ensurePreviewStarted
            }
            val cached = lensByKey[lensKey(lensId, groupId)]
            if (cached != null) {
                session.lenses.processor.apply(cached) { ok ->
                    if (generation != lensApplyGeneration.get()) {
                        if (!call.isReleased) call.reject("Lens request superseded")
                    } else if (ok) resolveAppliedAfterFrame(call, publishedFrameCount.get(), generation)
                    else call.reject("Failed to apply lens")
                }
                return@ensurePreviewStarted
            }
            session.lenses.repository.observe(
                LensesComponent.Repository.QueryCriteria.ById(lensId, groupId),
            ) { result ->
                result.whenHasFirst { lens ->
                    lensByKey[lensKey(lens.id, lens.groupId)] = lens
                    session.lenses.processor.apply(lens) { ok ->
                        if (generation != lensApplyGeneration.get()) {
                            if (!call.isReleased) call.reject("Lens request superseded")
                        } else if (ok) resolveAppliedAfterFrame(call, publishedFrameCount.get(), generation)
                        else call.reject("Failed to apply lens")
                    }
                }
            }
        }
    }

    @PluginMethod
    fun clearLens(call: PluginCall) {
        lensApplyGeneration.incrementAndGet()
        cameraKitSession?.lenses?.processor?.clear { _ ->
            call.resolve(JSObject().put("cleared", true))
        } ?: call.resolve(JSObject().put("cleared", true))
    }

    @PluginMethod
    fun startPreview(call: PluginCall) {
        facingFront = (call.getString("facing") ?: "user") != "environment"
        previewRequested = true
        ensurePreviewStarted { ok ->
            if (!ok) {
                // Never resolve success without a running camera — that was the
                // iOS black-screen pattern (UI thinks native works, no frames).
                call.reject("Camera preview failed to start")
                return@ensurePreviewStarted
            }
            Log.i(TAG, "startPreview facingFront=$facingFront")
            emitStatus("previewStarted", JSObject().put("facingFront", facingFront))
            notifyListeners("captureState", JSObject().put("running", previewStarted))
            call.resolve(JSObject().put("started", true))
        }
    }

    @PluginMethod
    fun stopPreview(call: PluginCall) {
        if (!publishEnabled) {
            previewRequested = false
            previewStarted = false
            runOnUi {
                try {
                    imageSource?.stopPreview()
                } catch (_: Throwable) {
                    /* older support-camerax may not expose stopPreview */
                }
                forceReleaseCameraX {
                    restoreWebViewBackground()
                    if (!call.isReleased) {
                        call.resolve(JSObject().put("stopped", true))
                    }
                }
            }
            return
        }
        // The preview is also Camera Kit's input for the active LiveKit
        // publisher, so it cannot be stopped independently while publishing.
        // Report the partial stop honestly instead of claiming the native
        // surface was released.
        call.resolve(
            JSObject()
                .put("stopped", false)
                .put("reason", "publishing"),
        )
    }

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

    override fun handleOnDestroy() {
        observeHandle?.close()
        observeHandle = null
        // Run cleanup synchronously: scope.launch then scope.cancel() cancelled
        // the coroutine before it ran, leaking the LiveKit room + camera.
        try {
            kotlinx.coroutines.runBlocking { stopPublishing() }
        } catch (_: Exception) {
        }
        cameraKitSession?.close()
        cameraKitSession = null
        imageSource = null
        initialized = false
        previewStarted = false
        previewRequested = false
        previewStarting = false
        synchronized(sessionLock) {
            previewStartCallbacks.clear()
        }
        scope.cancel()
        super.handleOnDestroy()
    }

    override fun handleOnStop() {
        super.handleOnStop()
        if (!previewRequested && !publishEnabled) return

        // CameraX is lifecycle-bound to the Activity and drops its use-cases
        // when the Activity stops. Keep the intent to run, but never keep the
        // stale `previewStarted=true`: that made ensurePreviewStarted() skip
        // rebinding after Android background/PiP and left a frozen AR frame.
        previewStarted = false
        previewStarting = false
        lastPublishedFrameAt.set(SystemClock.elapsedRealtime())
        runOnUi {
            try {
                imageSource?.stopPreview()
            } catch (e: Throwable) {
                Log.w(TAG, "Camera Kit pause cleanup failed", e)
            }
        }
        Log.i(TAG, "activity stopped; Camera Kit preview marked for rebind")
    }

    override fun handleOnResume() {
        super.handleOnResume()
        if (!initialized || (!previewRequested && !publishEnabled)) return
        Log.i(TAG, "activity resumed; rebinding Camera Kit preview")
        ensurePreviewStarted { ok ->
            if (ok) {
                lastPublishedFrameAt.set(SystemClock.elapsedRealtime())
                emitStatus("previewResumed")
            } else {
                Log.e(TAG, "Camera Kit preview failed to resume")
                emitStatus("previewResumeFailed")
            }
        }
    }

    private fun ensurePreviewStarted(done: (ok: Boolean) -> Unit) {
        val activity = activity
        val source = imageSource
        if (activity == null || source == null) {
            done(false)
            return
        }
        synchronized(sessionLock) {
            if (previewStarted) {
                done(true)
                return
            }
            previewStartCallbacks.add(done)
            if (previewStarting) return
            previewStarting = true
        }
        // CameraX binding must run on the main thread. This method is also
        // called from the Capacitor bridge thread (startPreview), so always
        // hop to the UI thread — otherwise CameraX can bind on the wrong
        // thread and deliver no frames (black stream).
        val start: () -> Unit = {
            runOnUi {
                if (previewStarted) {
                    finishPreviewStart(true)
                    return@runOnUi
                }
                // CameraXImageProcessorSource can leave its Preview and
                // ImageCapture use-cases bound after stopPreview/lifecycle
                // changes. Starting it again then binds a second identical
                // pair and crashes strict Samsung devices. Force an unbind and
                // wait for CameraDevice.onClosed() before the next bind.
                forceReleaseCameraX {
                    if (previewStarted) {
                        finishPreviewStart(true)
                        return@forceReleaseCameraX
                    }
                    try {
                        source.startPreview(facingFront)
                        makeWebViewTransparent()
                        finishPreviewStart(true)
                    } catch (e: Exception) {
                        Log.e(TAG, "startPreview failed", e)
                        finishPreviewStart(false)
                    }
                }
            }
        }
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED
        ) {
            start()
        } else {
            ActivityCompat.requestPermissions(
                activity,
                arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO),
                REQ_CAMERA,
            )
            activity.window.decorView.postDelayed({ start() }, 400)
        }
    }

    private fun finishPreviewStart(ok: Boolean) {
        val callbacks = synchronized(sessionLock) {
            previewStarted = ok
            previewStarting = false
            previewStartCallbacks.toList().also { previewStartCallbacks.clear() }
        }
        callbacks.forEach { callback ->
            try {
                callback(ok)
            } catch (e: Exception) {
                Log.w(TAG, "preview start callback failed", e)
            }
        }
    }

    /** Runs [task] on the main thread (inline if already there). */
    private fun runOnUi(task: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            task()
        } else {
            activity?.runOnUiThread(task)
        }
    }

    /** Unbinds stale CameraX use-cases and waits for the camera service to
     * finish closing the device before another Camera Kit preview starts. */
    private fun forceReleaseCameraX(done: () -> Unit) {
        val act = activity
        if (act == null) {
            done()
            return
        }
        runOnUi {
            try {
                val providerFuture = ProcessCameraProvider.getInstance(act)
                providerFuture.addListener({
                    try {
                        providerFuture.get().unbindAll()
                    } catch (e: Exception) {
                        Log.w(TAG, "CameraX unbindAll failed", e)
                    }
                    act.window.decorView.postDelayed(done, CAMERA_X_RELEASE_DELAY_MS)
                }, ContextCompat.getMainExecutor(act))
            } catch (e: Exception) {
                Log.w(TAG, "CameraX provider unavailable", e)
                act.window.decorView.postDelayed(done, CAMERA_X_RELEASE_DELAY_MS)
            }
        }
    }

    /** Runs [task] on the main thread and blocks the caller until done. */
    private fun <T> runOnUiBlocking(task: () -> T): T {
        if (Looper.myLooper() == Looper.getMainLooper()) return task()
        val latch = CountDownLatch(1)
        var result: Result<T>? = null
        val act = activity
        if (act == null) throw IllegalStateException("no activity")
        act.runOnUiThread {
            result = runCatching(task)
            latch.countDown()
        }
        latch.await(10, TimeUnit.SECONDS)
        return result?.getOrThrow()
            ?: throw IllegalStateException("UI thread did not run Camera Kit task in time")
    }

    private fun ensureStub(): ViewStub {
        val activity = activity ?: throw IllegalStateException("no activity")
        activity.findViewById<ViewStub>(R.id.camera_kit_stub)?.let { return it }
        val parent = (bridge?.webView?.parent as? ViewGroup)
            ?: activity.findViewById(android.R.id.content)
        val stub = ViewStub(activity).apply {
            id = R.id.camera_kit_stub
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }
        parent.addView(stub, 0)
        return stub
    }

    private fun makeWebViewTransparent() {
        runOnUi {
            // The Camera Kit preview renders BEHIND the WebView. If it is a
            // SurfaceView it lives in a separate window behind the main one,
            // so the window background must be transparent too — otherwise
            // the preview is composited behind an opaque window (black screen).
            try {
                activity?.window?.setBackgroundDrawable(
                    android.graphics.drawable.ColorDrawable(Color.TRANSPARENT),
                )
            } catch (e: Exception) {
                Log.w(TAG, "window transparency failed: ${e.message}")
            }
            val webView = bridge?.webView ?: return@runOnUi
            webView.setBackgroundColor(Color.TRANSPARENT)
            (webView.parent as? ViewGroup)?.setBackgroundColor(Color.TRANSPARENT)
        }
    }

    private fun restoreWebViewBackground() {
        // Undo makeWebViewTransparent() so a gap in web content shows the app
        // navy instead of a void behind the WebView.
        runOnUi {
            try {
                activity?.window?.setBackgroundDrawable(null)
            } catch (_: Exception) {
            }
            val webView = bridge?.webView ?: return@runOnUi
            webView.setBackgroundColor(Color.parseColor("#10162B"))
            (webView.parent as? ViewGroup)?.setBackgroundColor(Color.parseColor("#10162B"))
        }
    }

    private suspend fun startPublishing(url: String, token: String) {
        publishEnabled = true
        previewRequested = true
        val activity = activity ?: throw IllegalStateException("no activity")
        val session = cameraKitSession ?: throw IllegalStateException("Camera Kit session missing")

        var started = false
        var previewOk = false
        ensurePreviewStarted { ok -> started = true; previewOk = ok }
        var waits = 0
        while (!started && waits < 50) {
            kotlinx.coroutines.delay(50)
            waits++
        }
        if (!previewOk) {
            publishEnabled = false
            throw IllegalStateException("Camera preview failed to start — refusing to publish black frames")
        }

        val room = liveKitRoom ?: LiveKit.create(activity.applicationContext)
        liveKitRoom = room
        room.connect(url, token)

        val frameBeforePublish = publishedFrameCount.get()
        val capturer = CameraKitSurfaceCapturer(
            session = session,
            onConnected = { handle -> publishOutput = handle },
            onFrame = {
                publishedFrameCount.incrementAndGet()
                lastPublishedFrameAt.set(SystemClock.elapsedRealtime())
            },
        )
        val track = room.localParticipant.createVideoTrack(
            name = "camera",
            capturer = capturer,
        )
        liveKitTrack = track
        // publishVideoTrack() does NOT start an externally-provided capturer.
        // Without startCapture(), VideoCapturer.startCapture() is never invoked
        // and zero frames reach LiveKit — exactly the "no video frame within
        // 5000ms" failure seen on device.
        track.startCapture()
        room.localParticipant.publishVideoTrack(track)
        awaitFrameAfter(frameBeforePublish, 5_000)
        try {
            room.localParticipant.setMicrophoneEnabled(true)
        } catch (e: Exception) {
            Log.w(TAG, "mic publish failed", e)
        }
        Log.i(TAG, "LiveKit video published")
    }

    private fun resolveAppliedAfterFrame(
        call: PluginCall,
        frameBeforeApply: Long,
        generation: Long,
    ) {
        if (!publishEnabled) {
            call.resolve(JSObject().put("applied", true))
            return
        }
        scope.launch {
            try {
                awaitFrameAfter(frameBeforeApply, 3_500)
                if (generation != lensApplyGeneration.get()) {
                    if (!call.isReleased) call.reject("Lens request superseded")
                    return@launch
                }
                if (!call.isReleased) {
                    call.resolve(
                        JSObject()
                            .put("applied", true)
                            .put("frameCount", publishedFrameCount.get()),
                    )
                }
            } catch (e: Exception) {
                Log.e(TAG, "lens applied but no output frame arrived", e)
                if (!call.isReleased) call.reject("Lens produced no video frame")
            }
        }
    }

    private suspend fun awaitFrameAfter(baseline: Long, timeoutMs: Long) {
        val deadline = SystemClock.elapsedRealtime() + timeoutMs
        while (SystemClock.elapsedRealtime() < deadline) {
            if (publishedFrameCount.get() > baseline) return
            delay(50)
        }
        throw IllegalStateException("Camera Kit produced no video frame within ${timeoutMs}ms")
    }

    private suspend fun stopPublishing() {
        publishEnabled = false
        publishOutput?.close()
        publishOutput = null
        try {
            liveKitTrack?.stopCapture()
        } catch (_: Exception) {
        }
        try {
            liveKitTrack?.stop()
        } catch (_: Exception) {
        }
        liveKitTrack = null
        try {
            liveKitRoom?.disconnect()
        } catch (_: Exception) {
        }
        liveKitRoom = null
        Log.i(TAG, "LiveKit publish stopped")
    }

    private fun lensKey(id: String, groupId: String) = "$groupId|$id"

    private fun LensesComponent.Lens.toJs(): JSObject {
        val obj = JSObject()
        obj.put("id", id)
        obj.put("groupId", groupId)
        obj.put("name", name.orEmpty().ifBlank { "Lens" })
        val icon = icons.firstOrNull()?.uri?.toString()
        if (!icon.isNullOrEmpty()) obj.put("iconUrl", icon)
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

    private fun emitStatus(phase: String, extra: JSObject? = null) {
        val data = JSObject()
            .put("phase", phase)
            .put("initialized", initialized)
            .put("sessionStarted", previewStarted)
            .put("captureRunning", previewStarted)
        extra?.keys()?.forEach { key ->
            data.put(key, extra.get(key))
        }
        notifyListeners("status", data)
    }

    companion object {
        private const val TAG = "KidiCameraKit"
        private const val REQ_CAMERA = 4921
        private const val CAMERA_X_RELEASE_DELAY_MS = 700L
    }
}

/**
 * Pushes Camera Kit's filtered frames into LiveKit via a SurfaceTexture.
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
            Log.e("KidiCameraKit", "capturer startCapture called before initialize()")
            observer?.onCapturerStarted(false)
            return
        }
        Log.i("KidiCameraKit", "capturer startCapture ${width}x${height}@$framerate")
        // Respect the requested aspect ratio — forcing a 720x1280 floor turned
        // landscape/low-res requests into a distorted square surface.
        helper.setTextureSize(width.coerceAtLeast(640), height.coerceAtLeast(480))
        helper.startListening { frame: VideoFrame ->
            framesSeen++
            if (framesSeen == 1L) {
                Log.i("KidiCameraKit", "first Camera Kit frame delivered to LiveKit")
            }
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
                override fun writeFrame(): ImageProcessor.Output.Frame {
                    return object : ImageProcessor.Output.Frame {
                        override val timestamp: Long = SystemClock.elapsedRealtimeNanos()
                        override fun recycle() = Unit
                    }
                }
            },
        )
        output = connected
        onConnected(connected)
        Log.i("KidiCameraKit", "Camera Kit output connected to LiveKit capturer")
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
