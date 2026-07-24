import AVFoundation
import AVKit
import Capacitor
import LiveKit
import UIKit

/**
 * Native LiveKit viewer used only to feed iOS system Picture-in-Picture.
 * The Capacitor WebView keeps the full live UI; this is a second viewer whose
 * frames go to AVSampleBufferDisplayLayer (LiveKit minimal-pip pattern).
 */
final class LivePipSession: NSObject, @unchecked Sendable {
    static let shared = LivePipSession()

    private let room = Room()
    private let previewController = LivePipPreviewController()
    private let videoCallController = LivePipVideoCallController()
    private var pipController: AVPictureInPictureController?
    private var modeListener: ((Bool) -> Void)?
    private var eligible = false
    private var connected = false
    private var hostTrack: VideoTrack?
    private var hasRenderedFrame = false
    private var resignObserver: NSObjectProtocol?
    private var backgroundObserver: NSObjectProtocol?
    private var activeObserver: NSObjectProtocol?
    private weak var hostView: UIView?
    private var pipRetryWorkItems: [DispatchWorkItem] = []
    private var previewConstraints: [NSLayoutConstraint] = []

    var isInPip: Bool {
        pipController?.isPictureInPictureActive ?? false
    }

    var isSupported: Bool {
        AVPictureInPictureController.isPictureInPictureSupported()
    }

    func setModeListener(_ listener: ((Bool) -> Void)?) {
        modeListener = listener
    }

    func attach(to hostView: UIView) {
        self.hostView = hostView
        // Do NOT create AVPictureInPictureController here.
        // Creating it at launch with auto-start makes iOS open an empty PiP
        // bubble whenever the user leaves the app — even with no live open.
        observeAppLifecycle()
        print("[KiDi+] LivePipSession attached (lazy), pipSupported=\(isSupported)")
    }

    func setEligible(_ on: Bool, url: String?, token: String?) async {
        print("[KiDi+] LivePipSession setEligible=\(on) url=\(url != nil) token=\(token != nil)")
        if !on {
            eligible = false
            cancelPipRetries()
            await teardown()
            return
        }
        guard let url, let token, !url.isEmpty, !token.isEmpty else {
            // Never leave eligible=true without a real LiveKit session — that
            // caused empty PiP bubbles when leaving the app with no live open.
            eligible = false
            print("[KiDi+] LivePipSession enable ignored — missing url/token (publish web JS?)")
            await teardown()
            return
        }
        eligible = true
        await MainActor.run {
            self.ensureSourceViewsAttached()
        }
        await connect(url: url, token: token)
    }

    func startPipIfPossible() {
        DispatchQueue.main.async {
            guard self.eligible else {
                print("[KiDi+] startPip skipped — not eligible")
                self.cancelPipRetries()
                self.destroyPipController()
                return
            }
            guard self.isSupported else {
                print("[KiDi+] startPip skipped — not supported on device")
                return
            }
            guard self.connected else {
                print("[KiDi+] startPip skipped — native LiveKit not connected")
                self.schedulePipRetries()
                return
            }
            guard self.hostTrack != nil else {
                print("[KiDi+] startPip skipped — no remote video track yet")
                self.schedulePipRetries()
                return
            }
            guard self.hasRenderedFrame else {
                print("[KiDi+] startPip deferred — waiting for first video frame")
                self.schedulePipRetries()
                return
            }
            // Must be visible before startPictureInPicture / auto-inline.
            self.ensureSourceViewsAttached()
            self.ensurePipController(forceRebuild: false)
            guard let pip = self.pipController else {
                print("[KiDi+] startPip skipped — no pipController")
                self.schedulePipRetries()
                return
            }
            if pip.isPictureInPictureActive {
                self.cancelPipRetries()
                return
            }
            // Prefer auto-inline once frames exist (iOS handles Home gesture).
            pip.canStartPictureInPictureAutomaticallyFromInline = true
            // Still try an explicit start — do not bail solely on
            // isPictureInPicturePossible (it flickers false during resign).
            let possible: Bool
            if #available(iOS 15.0, *) {
                possible = pip.isPictureInPicturePossible
            } else {
                possible = true
            }
            // If still "impossible", rebuild the controller once — stale
            // ContentSource after hide/show of the source view is common.
            if !possible {
                print("[KiDi+] PiP not possible yet — rebuilding controller")
                self.ensurePipController(forceRebuild: true)
                self.pipController?.canStartPictureInPictureAutomaticallyFromInline = true
            }
            let controller = self.pipController ?? pip
            print("[KiDi+] starting Picture in Picture… possible=\(possible)")
            controller.startPictureInPicture()
            self.schedulePipRetries()
        }
    }

    private func schedulePipRetries() {
        cancelPipRetries()
        // Aggressive retries while suspended — first frames / track subscribe
        // often land a beat after Home.
        let delays: [TimeInterval] = [0.25, 0.6, 1.2, 2.0, 3.5, 5.5]
        for delay in delays {
            let work = DispatchWorkItem { [weak self] in
                guard let self else { return }
                guard self.eligible else { return }
                guard UIApplication.shared.applicationState != .active else { return }
                guard !self.isInPip else {
                    self.cancelPipRetries()
                    return
                }
                print("[KiDi+] PiP retry after \(delay)s")
                self.ensureSourceViewsAttached()
                self.startPipIfPossible()
            }
            pipRetryWorkItems.append(work)
            DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
        }
    }

    private func cancelPipRetries() {
        pipRetryWorkItems.forEach { $0.cancel() }
        pipRetryWorkItems.removeAll()
    }

    @discardableResult
    func stopPip() -> Bool {
        cancelPipRetries()
        guard let pip = pipController, pip.isPictureInPictureActive else { return false }
        pip.stopPictureInPicture()
        return true
    }

    func dismiss() async -> Bool {
        let wasPip = await MainActor.run {
            self.cancelPipRetries()
            return self.stopPip()
        }
        eligible = false
        await teardown()
        return wasPip
    }

    private func activatePipAudioSession(reason: String) {
        AudioManager.shared.isSpeakerOutputPreferred = true
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(
                .playback,
                mode: .moviePlayback,
                options: []
            )
            try session.setActive(true)
            print("[KiDi+] PiP audio session active (\(reason))")
        } catch {
            print("[KiDi+] PiP audio session failed (\(reason)): \(error)")
        }
    }

    /// Force-subscribe remote audio + video. Stale / racing unsubscribes are the
    /// usual cause of "video without sound" or "sound without video" in system PiP.
    private func ensureAllRemoteMediaSubscribed(reason: String) {
        print("[KiDi+] ensureAllRemoteMediaSubscribed (\(reason)) remotes=\(room.remoteParticipants.count)")
        for participant in room.remoteParticipants.values {
            for publication in participant.trackPublications.values {
                guard let remote = publication as? RemoteTrackPublication else { continue }
                Task {
                    do {
                        try await remote.set(subscribed: true)
                        if publication.kind == .audio {
                            print("[KiDi+] LivePipSession audio force-subscribed (\(reason))")
                        } else if let track = publication.track as? VideoTrack {
                            await MainActor.run {
                                self.setHostTrack(track)
                            }
                        }
                    } catch {
                        print("[KiDi+] LivePipSession force-subscribe failed (\(reason)): \(error)")
                    }
                }
            }
        }
    }

    private func prepareForBackgroundPip(reason: String) {
        activatePipAudioSession(reason: reason)
        ensureAllRemoteMediaSubscribed(reason: reason)
        ensureSourceViewsAttached()
        // Drop any stale black frame left from a previous PiP cycle.
        previewController.flushForPipHandoff()
        videoCallController.flushForPipHandoff()
        startPipIfPossible()
    }

    private func connect(url: String, token: String) async {
        if connected {
            await teardownRoomOnly()
        }
        // Ensure LiveKit can play remote host audio in the background PiP bubble.
        // Without this, video PiP can appear while playout stays silent.
        await MainActor.run {
            self.activatePipAudioSession(reason: "pre-connect")
        }
        room.add(delegate: self)
        do {
            try await room.connect(url: url, token: token)
            connected = true
            print("[KiDi+] LivePipSession connected, remotes=\(room.remoteParticipants.count)")
            await MainActor.run {
                self.bindExistingRemoteTracks()
                self.ensureAllRemoteMediaSubscribed(reason: "post-connect")
            }
        } catch {
            print("[KiDi+] LivePipSession connect failed: \(error)")
            connected = false
        }
    }

    private func teardown() async {
        await MainActor.run {
            self.cancelPipRetries()
            _ = self.stopPip()
            self.destroyPipController()
            if let track = self.hostTrack {
                track.remove(videoRenderer: self.previewController)
                track.remove(videoRenderer: self.videoCallController)
                self.hostTrack = nil
            }
            self.detachSourceViews()
            self.hasRenderedFrame = false
        }
        await teardownRoomOnly()
    }

    private func teardownRoomOnly() async {
        room.remove(delegate: self)
        await room.disconnect()
        connected = false
    }

    private func bindExistingRemoteTracks() {
        for participant in room.remoteParticipants.values {
            for publication in participant.trackPublications.values {
                // Keep audio + video subscribed so host A/V both keep playing in system PiP.
                if let remote = publication as? RemoteTrackPublication {
                    Task {
                        do {
                            try await remote.set(subscribed: true)
                            if publication.kind == .audio {
                                print("[KiDi+] LivePipSession audio track subscribed")
                            }
                        } catch {
                            print("[KiDi+] LivePipSession subscribe failed: \(error)")
                        }
                    }
                }
                if let track = publication.track as? VideoTrack {
                    setHostTrack(track)
                }
            }
        }
    }

    private func setHostTrack(_ track: VideoTrack) {
        if let prev = hostTrack, prev !== track {
            prev.remove(videoRenderer: previewController)
            prev.remove(videoRenderer: videoCallController)
        }
        hostTrack = track
        hasRenderedFrame = false
        ensureSourceViewsAttached()
        track.add(videoRenderer: previewController)
        track.add(videoRenderer: videoCallController)
        // Create PiP controller only once we actually have a live video track.
        ensurePipController(forceRebuild: true)
        print("[KiDi+] LivePipSession host video track bound")
        // If user already left the app while we were connecting, start once frames arrive.
        if UIApplication.shared.applicationState != .active {
            startPipIfPossible()
        }
    }

    private func ensureSourceViewsAttached() {
        guard let hostView else { return }
        let preview = previewController.view!
        _ = videoCallController.view
        // Keep the source view opaque and in-hierarchy (behind the WebView).
        // Near-zero alpha makes iOS report isPictureInPicturePossible=false.
        preview.isHidden = false
        preview.alpha = 1
        preview.isUserInteractionEnabled = false
        preview.backgroundColor = .black
        if preview.superview !== hostView {
            preview.translatesAutoresizingMaskIntoConstraints = false
            hostView.insertSubview(preview, at: 0)
            previewConstraints = [
                preview.widthAnchor.constraint(equalToConstant: 118),
                preview.heightAnchor.constraint(equalToConstant: 210),
                preview.leadingAnchor.constraint(equalTo: hostView.leadingAnchor, constant: 8),
                preview.bottomAnchor.constraint(equalTo: hostView.safeAreaLayoutGuide.bottomAnchor, constant: -72),
            ]
            NSLayoutConstraint.activate(previewConstraints)
        }
        hostView.layoutIfNeeded()
    }

    private func detachSourceViews() {
        NSLayoutConstraint.deactivate(previewConstraints)
        previewConstraints.removeAll()
        previewController.view?.removeFromSuperview()
    }

    private func ensurePipController(forceRebuild: Bool) {
        if forceRebuild {
            destroyPipController()
        }
        guard eligible, isSupported, pipController == nil else { return }
        ensureSourceViewsAttached()
        let source = AVPictureInPictureController.ContentSource(
            activeVideoCallSourceView: previewController.view,
            contentViewController: videoCallController
        )
        let controller = AVPictureInPictureController(contentSource: source)
        // When a live is ready, let iOS auto-start PiP on Home (TikTok-style).
        // Controller is only created while eligible, so this won't fire empty bubbles.
        controller.canStartPictureInPictureAutomaticallyFromInline = hasRenderedFrame
        controller.delegate = self
        controller.setValue(1, forKey: "controlsStyle")
        pipController = controller
        print("[KiDi+] pipController created, autoInline=\(hasRenderedFrame)")
    }

    private func destroyPipController() {
        if let pip = pipController {
            pip.canStartPictureInPictureAutomaticallyFromInline = false
            if pip.isPictureInPictureActive {
                pip.stopPictureInPicture()
            }
            pip.delegate = nil
        }
        pipController = nil
    }

    fileprivate func noteFrameRendered() {
        let first = !hasRenderedFrame
        hasRenderedFrame = true
        if first {
            print("[KiDi+] LivePipSession first video frame received")
            // Enable automatic Home→PiP now that real frames exist.
            pipController?.canStartPictureInPictureAutomaticallyFromInline = true
            if pipController == nil {
                ensurePipController(forceRebuild: false)
                pipController?.canStartPictureInPictureAutomaticallyFromInline = true
            }
        }
        if UIApplication.shared.applicationState != .active {
            startPipIfPossible()
        }
    }

    private func observeAppLifecycle() {
        if resignObserver == nil {
            resignObserver = NotificationCenter.default.addObserver(
                forName: UIApplication.willResignActiveNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                guard let self else { return }
                // Hand exclusive playback to the native LiveKit session.
                // The WebView A/V is muted from JS while inactive — otherwise
                // WKWebView and native LiveKit fight AVAudioSession and you get
                // either silent video or audio with a frozen PiP frame.
                self.prepareForBackgroundPip(reason: "willResignActive")
            }
        }
        if backgroundObserver == nil {
            backgroundObserver = NotificationCenter.default.addObserver(
                forName: UIApplication.didEnterBackgroundNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                guard let self else { return }
                self.prepareForBackgroundPip(reason: "didEnterBackground")
            }
        }
        if activeObserver == nil {
            activeObserver = NotificationCenter.default.addObserver(
                forName: UIApplication.didBecomeActiveNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                guard let self else { return }
                self.cancelPipRetries()
                // Stop system PiP first, THEN hide the native source — hiding
                // while still active produced a black flash / stuck surface.
                if self.isInPip {
                    self.stopPip()
                }
                self.previewController.view?.isHidden = true
                self.previewController.view?.alpha = 0
            }
        }
    }

    private func emitMode(_ active: Bool) {
        modeListener?(active)
    }
}

extension LivePipSession: RoomDelegate {
    func room(_ room: Room, participant: RemoteParticipant, didSubscribeTrack publication: RemoteTrackPublication) {
        if publication.kind == .audio {
            print("[KiDi+] LivePipSession remote audio subscribed")
            Task { @MainActor in
                self.activatePipAudioSession(reason: "audio-subscribed")
            }
            return
        }
        guard let track = publication.track as? VideoTrack else { return }
        Task { @MainActor in
            self.setHostTrack(track)
        }
    }

    func room(_ room: Room, participant: RemoteParticipant, didUnpublishTrack publication: RemoteTrackPublication) {
        // no-op — keep PiP session alive if host briefly republishes
    }
}

extension LivePipSession: AVPictureInPictureControllerDelegate {
    func pictureInPictureControllerDidStartPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        print("[KiDi+] PiP did start")
        cancelPipRetries()
        // Re-claim audio the moment the bubble appears — WebView often still
        // holds the session for a beat after resignActive.
        activatePipAudioSession(reason: "pip-did-start")
        ensureAllRemoteMediaSubscribed(reason: "pip-did-start")
        // Force fresh frames into the PiP layers (avoids a stuck black surface).
        previewController.flushForPipHandoff()
        videoCallController.flushForPipHandoff()
        emitMode(true)
    }

    func pictureInPictureControllerDidStopPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        print("[KiDi+] PiP did stop")
        emitMode(false)
    }

    func pictureInPictureController(
        _ pictureInPictureController: AVPictureInPictureController,
        failedToStartPictureInPictureWithError error: Error
    ) {
        // Do NOT emitMode(false): JS treats that as "user closed PiP" and kills the live.
        print("[KiDi+] PiP failed to start: \(error)")
        schedulePipRetries()
    }
}

// MARK: - Renderers

private final class LivePipSampleView: UIView {
    override class var layerClass: AnyClass { AVSampleBufferDisplayLayer.self }
    var sampleBufferDisplayLayer: AVSampleBufferDisplayLayer {
        layer as! AVSampleBufferDisplayLayer
    }

    private var lastRotation: VideoRotation = ._0

    func enqueue(_ sampleBuffer: CMSampleBuffer) {
        if #available(iOS 17.0, *) {
            sampleBufferDisplayLayer.sampleBufferRenderer.enqueue(sampleBuffer)
        } else {
            sampleBufferDisplayLayer.enqueue(sampleBuffer)
        }
    }

    /// Drop stale/black frames so PiP gets a fresh keyframe stream.
    func flushForPipHandoff() {
        if #available(iOS 17.0, *) {
            sampleBufferDisplayLayer.sampleBufferRenderer.flush()
        } else {
            sampleBufferDisplayLayer.flushAndRemoveImage()
        }
    }

    /// Match LiveKit's SampleBufferVideoRenderer: CATransform3D rotation,
    /// never mirrored for a remote viewer (mirroring caused the "selfie" look).
    func applyRotationIfNeeded(_ rotation: VideoRotation) {
        guard rotation != lastRotation else { return }
        lastRotation = rotation
        sampleBufferDisplayLayer.transform = CATransform3D.from(rotation: rotation)
        sampleBufferDisplayLayer.frame = bounds
        sampleBufferDisplayLayer.removeAllAnimations()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        sampleBufferDisplayLayer.transform = CATransform3D.from(rotation: lastRotation)
        sampleBufferDisplayLayer.frame = bounds
        sampleBufferDisplayLayer.removeAllAnimations()
    }
}

private final class LivePipPreviewController: UIViewController, VideoRenderer, @unchecked Sendable {
    private lazy var renderingView = LivePipSampleView()

    override func loadView() {
        renderingView.sampleBufferDisplayLayer.videoGravity = .resizeAspectFill
        if #available(iOS 15.0, *) {
            renderingView.sampleBufferDisplayLayer.preventsDisplaySleepDuringVideoPlayback = true
        }
        view = renderingView
    }

    func flushForPipHandoff() {
        renderingView.flushForPipHandoff()
    }

    // Keep frames flowing even when the source view is tiny / briefly hidden —
    // adaptive stream was pausing video before Home→PiP could start.
    var isAdaptiveStreamEnabled: Bool { false }
    var adaptiveStreamSize: CGSize { CGSize(width: 270, height: 480) }

    func render(frame: VideoFrame) {
        guard let sampleBuffer = frame.toCMSampleBuffer() else { return }
        Task { @MainActor in
            renderingView.applyRotationIfNeeded(frame.rotation)
            renderingView.enqueue(sampleBuffer)
            LivePipSession.shared.noteFrameRendered()
        }
    }
}

private final class LivePipVideoCallController: AVPictureInPictureVideoCallViewController, VideoRenderer, @unchecked Sendable {
    private lazy var renderingView = LivePipSampleView()

    override func loadView() {
        renderingView.sampleBufferDisplayLayer.videoGravity = .resizeAspectFill
        if #available(iOS 15.0, *) {
            renderingView.sampleBufferDisplayLayer.preventsDisplaySleepDuringVideoPlayback = true
        }
        view = renderingView
        // Real landscape-ish portrait size — 9×16 pts made iOS open an empty black bubble.
        preferredContentSize = CGSize(width: 270, height: 480)
    }

    func flushForPipHandoff() {
        renderingView.flushForPipHandoff()
    }

    var isAdaptiveStreamEnabled: Bool { false }
    var adaptiveStreamSize: CGSize { CGSize(width: 270, height: 480) }

    func render(frame: VideoFrame) {
        guard let sampleBuffer = frame.toCMSampleBuffer() else { return }
        Task { @MainActor in
            renderingView.applyRotationIfNeeded(frame.rotation)
            renderingView.enqueue(sampleBuffer)
            preferredContentSize = frame.rotatedSize
            LivePipSession.shared.noteFrameRendered()
        }
    }
}

private extension CATransform3D {
    /// Same mapping as LiveKit `SampleBufferVideoRenderer` (no mirroring).
    static func from(rotation: VideoRotation) -> CATransform3D {
        switch rotation {
        case ._0:
            return CATransform3DIdentity
        case ._90:
            return CATransform3DMakeRotation(.pi / 2.0, 0, 0, 1)
        case ._180:
            return CATransform3DMakeRotation(.pi, 0, 0, 1)
        case ._270:
            return CATransform3DMakeRotation(-.pi / 2.0, 0, 0, 1)
        @unknown default:
            return CATransform3DIdentity
        }
    }
}

private extension VideoFrame {
    var rotatedSize: CGSize {
        switch rotation {
        case ._90, ._270:
            return CGSize(width: Int(dimensions.height), height: Int(dimensions.width))
        default:
            return CGSize(width: Int(dimensions.width), height: Int(dimensions.height))
        }
    }
}
