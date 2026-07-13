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
    private var resignObserver: NSObjectProtocol?
    private var backgroundObserver: NSObjectProtocol?
    private var activeObserver: NSObjectProtocol?
    private weak var hostView: UIView?

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
        // Source view must be in the hierarchy with a real size — a 2×2 view
        // makes system PiP fail silently on many iPhones.
        let preview = previewController.view!
        if preview.superview !== hostView {
            preview.translatesAutoresizingMaskIntoConstraints = false
            preview.isUserInteractionEnabled = false
            preview.alpha = 0.01
            preview.backgroundColor = .black
            hostView.insertSubview(preview, at: 0)
            NSLayoutConstraint.activate([
                preview.widthAnchor.constraint(equalToConstant: 118),
                preview.heightAnchor.constraint(equalToConstant: 210),
                preview.leadingAnchor.constraint(equalTo: hostView.leadingAnchor, constant: 8),
                preview.bottomAnchor.constraint(equalTo: hostView.safeAreaLayoutGuide.bottomAnchor, constant: -72),
            ])
        }
        // Force loadView so the sample buffer layer exists before first frame.
        _ = previewController.view
        _ = videoCallController.view
        ensurePipController(forceRebuild: true)
        observeAppLifecycle()
        print("[KiDi+] LivePipSession attached, pipSupported=\(isSupported)")
    }

    func setEligible(_ on: Bool, url: String?, token: String?) async {
        eligible = on
        print("[KiDi+] LivePipSession setEligible=\(on) url=\(url != nil) token=\(token != nil)")
        if !on {
            await teardown()
            return
        }
        guard let url, let token, !url.isEmpty, !token.isEmpty else {
            print("[KiDi+] LivePipSession enable ignored — missing url/token (publish web JS?)")
            return
        }
        await connect(url: url, token: token)
    }

    func startPipIfPossible() {
        DispatchQueue.main.async {
            guard self.eligible else {
                print("[KiDi+] startPip skipped — not eligible")
                return
            }
            guard self.isSupported else {
                print("[KiDi+] startPip skipped — not supported on device")
                return
            }
            guard self.connected else {
                print("[KiDi+] startPip skipped — native LiveKit not connected")
                return
            }
            guard self.hostTrack != nil else {
                print("[KiDi+] startPip skipped — no remote video track yet")
                return
            }
            self.ensurePipController(forceRebuild: false)
            guard let pip = self.pipController else {
                print("[KiDi+] startPip skipped — no pipController")
                return
            }
            if pip.isPictureInPictureActive { return }
            print("[KiDi+] starting Picture in Picture…")
            pip.startPictureInPicture()
        }
    }

    @discardableResult
    func stopPip() -> Bool {
        guard let pip = pipController, pip.isPictureInPictureActive else { return false }
        pip.stopPictureInPicture()
        return true
    }

    func dismiss() async -> Bool {
        let wasPip = await MainActor.run { self.stopPip() }
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
        await MainActor.run { _ = self.stopPip() }
        await teardownRoomOnly()
        hostTrack = nil
    }

    private func teardownRoomOnly() async {
        room.remove(delegate: self)
        if let track = hostTrack {
            track.remove(videoRenderer: previewController)
            track.remove(videoRenderer: videoCallController)
        }
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
        track.add(videoRenderer: previewController)
        track.add(videoRenderer: videoCallController)
        ensurePipController(forceRebuild: true)
        print("[KiDi+] LivePipSession host video track bound")
        // If user already left the app while we were connecting, start now.
        if UIApplication.shared.applicationState != .active {
            startPipIfPossible()
        }
    }

    private func ensurePipController(forceRebuild: Bool) {
        if forceRebuild {
            pipController?.delegate = nil
            pipController = nil
        }
        guard isSupported, pipController == nil else { return }
        let source = AVPictureInPictureController.ContentSource(
            activeVideoCallSourceView: previewController.view,
            contentViewController: videoCallController
        )
        let controller = AVPictureInPictureController(contentSource: source)
        controller.canStartPictureInPictureAutomaticallyFromInline = true
        controller.delegate = self
        controller.setValue(1, forKey: "controlsStyle")
        pipController = controller
    }

    private func observeAppLifecycle() {
        if resignObserver == nil {
            resignObserver = NotificationCenter.default.addObserver(
                forName: UIApplication.willResignActiveNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                // Must start before fully backgrounded — didEnterBackground is often too late.
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
