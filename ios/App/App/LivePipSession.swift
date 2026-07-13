import AVKit
import Capacitor
import LiveKit
import UIKit

/**
 * Native LiveKit viewer used only to feed iOS system Picture-in-Picture.
 * The Capacitor WebView keeps the full live UI; this is a second viewer whose
 * frames go to AVSampleBufferDisplayLayer (LiveKit minimal-pip pattern).
 */
final class LivePipSession: NSObject {
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
                // Make sure no empty auto-PiP controller is lingering.
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
            if #available(iOS 15.0, *), !pip.isPictureInPicturePossible {
                print("[KiDi+] startPip deferred — isPictureInPicturePossible=false")
                self.schedulePipRetries()
                return
            }
            print("[KiDi+] starting Picture in Picture…")
            pip.startPictureInPicture()
        }
    }

    private func schedulePipRetries() {
        cancelPipRetries()
        let delays: [TimeInterval] = [0.4, 1.0, 2.0, 4.0]
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

    private func connect(url: String, token: String) async {
        if connected {
            await teardownRoomOnly()
        }
        room.add(delegate: self)
        do {
            try await room.connect(url: url, token: token)
            connected = true
            print("[KiDi+] LivePipSession connected, remotes=\(room.remoteParticipants.count)")
            await MainActor.run {
                self.bindExistingRemoteVideo()
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

    private func bindExistingRemoteVideo() {
        for participant in room.remoteParticipants.values {
            for publication in participant.trackPublications.values {
                if let track = publication.track as? VideoTrack {
                    setHostTrack(track)
                    return
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
        if preview.superview !== hostView {
            preview.translatesAutoresizingMaskIntoConstraints = false
            preview.isUserInteractionEnabled = false
            preview.alpha = 0.01
            preview.backgroundColor = .black
            hostView.insertSubview(preview, at: 0)
            previewConstraints = [
                preview.widthAnchor.constraint(equalToConstant: 118),
                preview.heightAnchor.constraint(equalToConstant: 210),
                preview.leadingAnchor.constraint(equalTo: hostView.leadingAnchor, constant: 8),
                preview.bottomAnchor.constraint(equalTo: hostView.safeAreaLayoutGuide.bottomAnchor, constant: -72),
            ]
            NSLayoutConstraint.activate(previewConstraints)
        }
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
        // Manual start only — automatic inline PiP was starting an empty bubble
        // whenever the user left the app, even with no live open.
        controller.canStartPictureInPictureAutomaticallyFromInline = false
        controller.delegate = self
        controller.setValue(1, forKey: "controlsStyle")
        pipController = controller
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
        if hasRenderedFrame { return }
        hasRenderedFrame = true
        print("[KiDi+] LivePipSession first video frame received")
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
                // Only starts when eligible + connected + frames are ready.
                self?.startPipIfPossible()
            }
        }
        if backgroundObserver == nil {
            backgroundObserver = NotificationCenter.default.addObserver(
                forName: UIApplication.didEnterBackgroundNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.startPipIfPossible()
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
                // Returning to the app (icon or PiP tap) — leave system PiP.
                if self.isInPip {
                    self.stopPip()
                }
            }
        }
    }

    private func emitMode(_ active: Bool) {
        modeListener?(active)
    }
}

extension LivePipSession: RoomDelegate {
    func room(_ room: Room, participant: RemoteParticipant, didSubscribeTrack publication: RemoteTrackPublication) {
        guard let track = publication.track as? VideoTrack else { return }
        Task { @MainActor in
            self.setHostTrack(track)
        }
    }
}

extension LivePipSession: AVPictureInPictureControllerDelegate {
    func pictureInPictureControllerDidStartPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        print("[KiDi+] PiP did start")
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
        print("[KiDi+] PiP failed to start: \(error)")
        emitMode(false)
    }
}

// MARK: - Renderers

private final class LivePipSampleView: UIView {
    override class var layerClass: AnyClass { AVSampleBufferDisplayLayer.self }
    var sampleBufferDisplayLayer: AVSampleBufferDisplayLayer {
        layer as! AVSampleBufferDisplayLayer
    }

    func enqueue(_ sampleBuffer: CMSampleBuffer) {
        if #available(iOS 17.0, *) {
            sampleBufferDisplayLayer.sampleBufferRenderer.enqueue(sampleBuffer)
        } else {
            sampleBufferDisplayLayer.enqueue(sampleBuffer)
        }
    }
}

private final class LivePipPreviewController: UIViewController, VideoRenderer {
    private lazy var renderingView = LivePipSampleView()

    override func loadView() {
        renderingView.sampleBufferDisplayLayer.videoGravity = .resizeAspectFill
        view = renderingView
    }

    var isAdaptiveStreamEnabled: Bool { true }
    var adaptiveStreamSize: CGSize {
        let s = view.bounds.size
        return s.width > 1 && s.height > 1 ? s : CGSize(width: 118, height: 210)
    }

    func render(frame: VideoFrame) {
        guard let sampleBuffer = frame.toCMSampleBuffer() else { return }
        Task { @MainActor in
            renderingView.enqueue(sampleBuffer)
            renderingView.sampleBufferDisplayLayer.setAffineTransform(
                CGAffineTransform(rotationAngle: frame.rotation.rotationAngle)
            )
            LivePipSession.shared.noteFrameRendered()
        }
    }
}

private final class LivePipVideoCallController: AVPictureInPictureVideoCallViewController, VideoRenderer {
    private lazy var renderingView = LivePipSampleView()

    override func loadView() {
        renderingView.sampleBufferDisplayLayer.videoGravity = .resizeAspectFill
        view = renderingView
        preferredContentSize = CGSize(width: 9, height: 16)
    }

    var isAdaptiveStreamEnabled: Bool { true }
    var adaptiveStreamSize: CGSize {
        let s = view.bounds.size
        return s.width > 1 && s.height > 1 ? s : CGSize(width: 270, height: 480)
    }

    func render(frame: VideoFrame) {
        guard let sampleBuffer = frame.toCMSampleBuffer() else { return }
        Task { @MainActor in
            renderingView.enqueue(sampleBuffer)
            renderingView.sampleBufferDisplayLayer.setAffineTransform(
                CGAffineTransform(rotationAngle: frame.rotation.rotationAngle)
            )
            preferredContentSize = frame.rotatedSize
            LivePipSession.shared.noteFrameRendered()
        }
    }
}

private extension VideoRotation {
    var rotationAngle: CGFloat {
        switch self {
        case ._0: return 0
        case ._90: return .pi / 2
        case ._180: return .pi
        case ._270: return 3 * .pi / 2
        @unknown default: return 0
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
