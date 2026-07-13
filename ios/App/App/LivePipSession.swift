import AVKit
import Capacitor
import LiveKit
import UIKit

/**
 * Native LiveKit viewer used only to feed iOS system Picture-in-Picture.
 * The Capacitor WebView keeps the full live UI (chat / auctions); this session
 * is a second viewer connection whose frames go to AVSampleBufferDisplayLayer.
 *
 * Pattern adapted from livekit-examples/swift-example-collection minimal-pip.
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
    private var activeObserver: NSObjectProtocol?

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
        // PiP source view must stay in the hierarchy. Keep it tiny / nearly invisible
        // under the WebView so it does not affect UX.
        let preview = previewController.view!
        if preview.superview !== hostView {
            preview.translatesAutoresizingMaskIntoConstraints = false
            preview.isUserInteractionEnabled = false
            preview.alpha = 0.02
            hostView.insertSubview(preview, at: 0)
            NSLayoutConstraint.activate([
                preview.widthAnchor.constraint(equalToConstant: 2),
                preview.heightAnchor.constraint(equalToConstant: 2),
                preview.leadingAnchor.constraint(equalTo: hostView.leadingAnchor),
                preview.topAnchor.constraint(equalTo: hostView.topAnchor),
            ])
        }
        ensurePipController()
        observeAppLifecycle()
    }

    func setEligible(_ on: Bool, url: String?, token: String?) async {
        eligible = on
        if !on {
            await teardown()
            return
        }
        guard let url, let token, !url.isEmpty, !token.isEmpty else { return }
        await connect(url: url, token: token)
    }

    func startPipIfPossible() {
        guard eligible, connected, isSupported else { return }
        ensurePipController()
        guard let pip = pipController, !pip.isPictureInPictureActive else { return }
        pip.startPictureInPicture()
    }

    @discardableResult
    func stopPip() -> Bool {
        guard let pip = pipController, pip.isPictureInPictureActive else { return false }
        pip.stopPictureInPicture()
        return true
    }

    func dismiss() async -> Bool {
        let wasPip = stopPip()
        eligible = false
        await teardown()
        return wasPip
    }

    private func connect(url: String, token: String) async {
        if connected {
            await teardownRoomOnly()
        }
        do {
            try await room.connect(url: url, token: token)
            connected = true
            bindExistingRemoteVideo()
            room.add(delegate: self)
        } catch {
            print("[KiDi+] LivePipSession connect failed: \(error)")
            connected = false
        }
    }

    private func teardown() async {
        stopPip()
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
                guard let track = publication.track as? VideoTrack else { continue }
                setHostTrack(track)
                return
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
        ensurePipController()
    }

    private func ensurePipController() {
        guard isSupported, pipController == nil else { return }
        let source = AVPictureInPictureController.ContentSource(
            activeVideoCallSourceView: previewController.view,
            contentViewController: videoCallController
        )
        let controller = AVPictureInPictureController(contentSource: source)
        controller.canStartPictureInPictureAutomaticallyFromInline = true
        controller.delegate = self
        // Show close / restore controls when available.
        controller.setValue(1, forKey: "controlsStyle")
        pipController = controller
    }

    private func observeAppLifecycle() {
        if resignObserver == nil {
            resignObserver = NotificationCenter.default.addObserver(
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
        emitMode(true)
    }

    func pictureInPictureControllerDidStopPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
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
}

private final class LivePipPreviewController: UIViewController, VideoRenderer {
    private lazy var renderingView = LivePipSampleView()

    override func loadView() {
        renderingView.sampleBufferDisplayLayer.videoGravity = .resizeAspectFill
        view = renderingView
    }

    var isAdaptiveStreamEnabled: Bool { true }
    var adaptiveStreamSize: CGSize { view.bounds.size }

    func render(frame: VideoFrame) {
        guard let sampleBuffer = frame.toCMSampleBuffer() else { return }
        Task { @MainActor in
            renderingView.sampleBufferDisplayLayer.sampleBufferRenderer.enqueue(sampleBuffer)
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
    }

    var isAdaptiveStreamEnabled: Bool { true }
    var adaptiveStreamSize: CGSize { view.bounds.size }

    func render(frame: VideoFrame) {
        guard let sampleBuffer = frame.toCMSampleBuffer() else { return }
        Task { @MainActor in
            renderingView.sampleBufferDisplayLayer.sampleBufferRenderer.enqueue(sampleBuffer)
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
