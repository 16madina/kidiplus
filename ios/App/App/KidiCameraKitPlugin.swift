import ARKit
import AVFoundation
import Capacitor
import Foundation
import LiveKit
import SCSDKCameraKit
import UIKit

// LiveKit et Snap exportent tous deux `Session` — on force le type Snap.
private typealias CameraKitSession = SCSDKCameraKit.Session

// MARK: - KiDi+ Camera Kit native bridge
//
// SDK Snap natif (SCSDKCameraKit) + publication LiveKit via BufferCapturer.
// Remplace le rendu WASM `@snap/camera-kit` dans la WebView pendant le live.

@objc(KidiCameraKitPlugin)
public class KidiCameraKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KidiCameraKitPlugin"
    public let jsName = "KidiCameraKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "initialize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadLenses", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "applyLens", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearLens", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startPreview", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopPreview", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPublishEnabled", returnType: CAPPluginReturnPromise),
    ]

    private var cameraKit: CameraKitSession?
    private var captureSession: AVCaptureSession?
    private var sessionInput: AVSessionInput?
    private var previewView: PreviewView?
    private var groupIds: [String] = []
    private var isInitialized = false
    private var sessionStarted = false
    private var cameraPosition: AVCaptureDevice.Position = .front

    private var cachedLenses: [BridgeLens] = []
    private var lensByKey: [String: Lens] = [:]
    private var pendingLoadCall: CAPPluginCall?
    private var pendingLoadGroups: Set<String> = []
    private var receivedLoadGroups: Set<String> = []
    private var loadTimeoutWork: DispatchWorkItem?

    private let lensQueue = DispatchQueue(label: "com.kidiplus.camerakit.lenses")

    private var liveKitRoom: Room?
    private var liveKitVideoTrack: LocalVideoTrack?
    private var liveKitOutput: KidiCameraKitLiveKitOutput?
    private var publishEnabled = false

    // MARK: - initialize

    @objc func initialize(_ call: CAPPluginCall) {
        guard let apiToken = call.getString("apiToken"), !apiToken.isEmpty else {
            call.reject("Missing apiToken")
            return
        }
        guard let groupIds = call.getArray("groupIds", String.self), !groupIds.isEmpty else {
            call.reject("Missing groupIds")
            return
        }

        DispatchQueue.main.async {
            self.groupIds = groupIds

            if self.cameraKit == nil {
                let lensesConfig = LensesConfig(
                    cacheConfig: CacheConfig(lensContentMaxSize: 150 * 1024 * 1024)
                )
                let session = CameraKitSession(
                    sessionConfig: SessionConfig(apiToken: apiToken),
                    lensesConfig: lensesConfig,
                    errorHandler: nil
                )
                self.cameraKit = session
            }

            guard let session = self.cameraKit else {
                call.reject("Failed to create Camera Kit session")
                return
            }

            for groupId in groupIds {
                session.lenses.repository.addObserver(self, groupID: groupId)
            }

            self.isInitialized = true
            print("[KidiCameraKit] initialized groups=\(groupIds.joined(separator: ","))")
            call.resolve(["initialized": true])
        }
    }

    // MARK: - loadLenses

    @objc func loadLenses(_ call: CAPPluginCall) {
        guard isInitialized, let session = cameraKit else {
            call.reject("CameraKit not initialized — call initialize() first")
            return
        }
        guard let groupIds = call.getArray("groupIds", String.self), !groupIds.isEmpty else {
            call.reject("Missing groupIds")
            return
        }

        DispatchQueue.main.async {
            self.groupIds = groupIds
            let existing = self.collectLenses(from: session, groupIds: groupIds)
            if !existing.isEmpty {
                self.resolveLenses(call, lenses: existing)
                return
            }

            self.pendingLoadCall?.reject("Superseded by a newer loadLenses call")
            self.pendingLoadCall = call
            self.pendingLoadGroups = Set(groupIds)
            self.receivedLoadGroups = []

            for groupId in groupIds {
                session.lenses.repository.addObserver(self, groupID: groupId)
            }

            self.loadTimeoutWork?.cancel()
            let timeout = DispatchWorkItem { [weak self] in
                guard let self, let pending = self.pendingLoadCall else { return }
                self.pendingLoadCall = nil
                let lenses = self.collectLenses(from: session, groupIds: groupIds)
                self.resolveLenses(pending, lenses: lenses)
            }
            self.loadTimeoutWork = timeout
            DispatchQueue.main.asyncAfter(deadline: .now() + 8, execute: timeout)
        }
    }

    // MARK: - applyLens / clearLens

    @objc func applyLens(_ call: CAPPluginCall) {
        guard isInitialized, let session = cameraKit else {
            call.reject("CameraKit not initialized")
            return
        }
        guard let lensId = call.getString("lensId"), !lensId.isEmpty else {
            call.reject("Missing lensId")
            return
        }
        let groupId = call.getString("groupId") ?? ""

        lensQueue.async {
            let lens =
                self.lensByKey[self.lensKey(id: lensId, groupId: groupId)]
                ?? session.lenses.repository.lens(id: lensId, groupID: groupId)

            guard let lens else {
                DispatchQueue.main.async {
                    call.reject("Lens not found: \(lensId)")
                }
                return
            }

            guard let processor = session.lenses.processor else {
                DispatchQueue.main.async {
                    // Session pas encore démarrée : on démarre la preview puis on réessaie.
                    self.ensureSessionStarted(facing: self.cameraPosition == .front ? "user" : "environment") {
                        session.lenses.processor?.apply(lens: lens, launchData: nil) { success in
                            if success {
                                call.resolve(["applied": true])
                            } else {
                                call.reject("Failed to apply lens")
                            }
                        }
                    }
                }
                return
            }

            processor.apply(lens: lens, launchData: nil) { success in
                DispatchQueue.main.async {
                    if success {
                        print("[KidiCameraKit] applied \(lens.name ?? lensId)")
                        call.resolve(["applied": true])
                    } else {
                        call.reject("Failed to apply lens")
                    }
                }
            }
        }
    }

    @objc func clearLens(_ call: CAPPluginCall) {
        lensQueue.async {
            self.cameraKit?.lenses.processor?.clear { _ in
                DispatchQueue.main.async {
                    print("[KidiCameraKit] clearLens")
                    call.resolve(["cleared": true])
                }
            } ?? DispatchQueue.main.async {
                call.resolve(["cleared": true])
            }
        }
    }

    // MARK: - preview

    @objc func startPreview(_ call: CAPPluginCall) {
        let mirrored = call.getBool("mirrored") ?? false
        let facing = call.getString("facing") ?? "user"

        DispatchQueue.main.async {
            self.ensureSessionStarted(facing: facing) {
                if let preview = self.previewView {
                    preview.transform = mirrored ? CGAffineTransform(scaleX: -1, y: 1) : .identity
                }
                print("[KidiCameraKit] startPreview mirrored=\(mirrored) facing=\(facing)")
                call.resolve(["started": true])
            }
        }
    }

    @objc func stopPreview(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.teardownPreviewOnly()
            print("[KidiCameraKit] stopPreview")
            call.resolve(["stopped": true])
        }
    }

    // MARK: - LiveKit publishing

    @objc func setPublishEnabled(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        let roomUrl = call.getString("roomUrl")
        let token = call.getString("token")

        Task { @MainActor in
            if !enabled {
                await self.stopPublishing()
                call.resolve(["enabled": false])
                return
            }

            guard let roomUrl, let token, !roomUrl.isEmpty, !token.isEmpty else {
                call.reject("Missing roomUrl or token")
                return
            }

            do {
                try await self.startPublishing(url: roomUrl, token: token)
                call.resolve(["enabled": true])
            } catch {
                print("[KidiCameraKit] setPublishEnabled failed: \(error)")
                call.reject("Publish failed: \(error.localizedDescription)")
            }
        }
    }
}

// MARK: - Session lifecycle

private extension KidiCameraKitPlugin {
    func ensureSessionStarted(facing: String, completion: @escaping () -> Void) {
        cameraPosition = facing == "environment" ? .back : .front

        if sessionStarted, let previewView {
            attachPreview(previewView)
            makeWebViewTransparent()
            completion()
            return
        }

        guard let cameraKit else {
            completion()
            return
        }

        requestCameraAccess { [weak self] granted in
            guard let self else { return }
            guard granted else {
                print("[KidiCameraKit] camera permission denied")
                completion()
                return
            }

            let captureSession = self.captureSession ?? AVCaptureSession()
            self.captureSession = captureSession

            captureSession.beginConfiguration()
            // Reset video inputs when flipping.
            for input in captureSession.inputs {
                if let deviceInput = input as? AVCaptureDeviceInput,
                   deviceInput.device.hasMediaType(.video)
                {
                    captureSession.removeInput(deviceInput)
                }
            }
            if let device = AVCaptureDevice.default(
                .builtInWideAngleCamera,
                for: .video,
                position: self.cameraPosition
            ),
                let deviceInput = try? AVCaptureDeviceInput(device: device),
                captureSession.canAddInput(deviceInput)
            {
                captureSession.addInput(deviceInput)
            }
            captureSession.commitConfiguration()

            let input = self.sessionInput ?? AVSessionInput(session: captureSession)
            self.sessionInput = input
            let arInput = ARSessionInput()

            if !self.sessionStarted {
                cameraKit.start(
                    input: input,
                    arInput: arInput,
                    cameraPosition: self.cameraPosition,
                    videoOrientation: .portrait,
                    dataProvider: DataProviderComponent(
                        deviceMotion: nil,
                        userData: nil,
                        lensHint: nil,
                        location: nil,
                        mediaPicker: nil
                    ),
                    hintDelegate: nil,
                    textInputContextProvider: nil,
                    agreementsPresentationContextProvider: nil
                )
                self.sessionStarted = true
            } else {
                cameraKit.cameraPosition = self.cameraPosition
            }

            let preview = self.previewView ?? PreviewView()
            preview.automaticallyConfiguresTouchHandler = true
            preview.translatesAutoresizingMaskIntoConstraints = true
            preview.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            if self.previewView == nil {
                cameraKit.add(output: preview)
                self.previewView = preview
            }
            self.attachPreview(preview)
            self.makeWebViewTransparent()

            DispatchQueue.global(qos: .userInitiated).async {
                input.startRunning()
                DispatchQueue.main.async {
                    completion()
                }
            }
        }
    }

    func attachPreview(_ preview: UIView) {
        guard let host = bridge?.viewController?.view else { return }
        if preview.superview !== host {
            preview.removeFromSuperview()
            preview.frame = host.bounds
            host.insertSubview(preview, at: 0)
        } else {
            preview.frame = host.bounds
            host.sendSubviewToBack(preview)
        }
    }

    func makeWebViewTransparent() {
        guard let webView = bridge?.webView else { return }
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
    }

    func teardownPreviewOnly() {
        previewView?.removeFromSuperview()
        // Keep Camera Kit session alive if publishing; only hide preview.
        if !publishEnabled {
            sessionInput?.stopRunning()
        }
    }

    func requestCameraAccess(completion: @escaping (Bool) -> Void) {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            completion(true)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async { completion(granted) }
            }
        default:
            completion(false)
        }
    }
}

// MARK: - LiveKit

private extension KidiCameraKitPlugin {
    @MainActor
    func startPublishing(url: String, token: String) async throws {
        publishEnabled = true

        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            ensureSessionStarted(facing: cameraPosition == .front ? "user" : "environment") {
                cont.resume()
            }
        }

        guard let cameraKit else {
            throw NSError(
                domain: "KidiCameraKit",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Camera Kit session missing"]
            )
        }

        let room = liveKitRoom ?? Room()
        liveKitRoom = room
        if room.connectionState != .connected {
            try await room.connect(url: url, token: token)
        }

        let videoTrack = LocalVideoTrack.createBufferTrack(
            name: "camera",
            source: .camera,
            options: BufferCaptureOptions()
        )
        liveKitVideoTrack = videoTrack
        let capturer = videoTrack.capturer as? BufferCapturer

        let output = liveKitOutput ?? KidiCameraKitLiveKitOutput()
        output.capturer = capturer
        output.resetFrameFlag()
        if liveKitOutput == nil {
            cameraKit.add(output: output)
            liveKitOutput = output
        }

        // Attendre au moins une frame filtrée avant publish (dimensions LiveKit).
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            var resumed = false
            output.onFirstFrame = {
                guard !resumed else { return }
                resumed = true
                cont.resume()
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
                guard !resumed else { return }
                resumed = true
                cont.resume(
                    throwing: NSError(
                        domain: "KidiCameraKit",
                        code: 2,
                        userInfo: [NSLocalizedDescriptionKey: "Timed out waiting for Camera Kit frames"]
                    )
                )
            }
        }

        try await room.localParticipant.publish(videoTrack: videoTrack)
        // Best-effort mic — failure must not abort video publish.
        _ = try? await room.localParticipant.setMicrophone(enabled: true)

        print("[KidiCameraKit] LiveKit video published")
    }

    @MainActor
    func stopPublishing() async {
        publishEnabled = false
        if let output = liveKitOutput, let cameraKit {
            cameraKit.remove(output: output)
        }
        liveKitOutput = nil
        liveKitVideoTrack = nil
        await liveKitRoom?.disconnect()
        liveKitRoom = nil
        print("[KidiCameraKit] LiveKit publish stopped")
    }
}

// MARK: - Lens repository

extension KidiCameraKitPlugin: LensRepositoryGroupObserver {
    public func repository(
        _ repository: LensRepository,
        didUpdateLenses lenses: [Lens],
        forGroupID groupID: String
    ) {
        DispatchQueue.main.async {
            for lens in lenses {
                self.lensByKey[self.lensKey(id: lens.id, groupId: lens.groupId)] = lens
            }
            _ = self.cameraKit?.lenses.prefetcher.prefetch(lenses: lenses, completion: nil)

            guard self.pendingLoadCall != nil else { return }
            self.receivedLoadGroups.insert(groupID)
            if self.receivedLoadGroups.isSuperset(of: self.pendingLoadGroups) {
                self.finishPendingLoad()
            }
        }
    }

    public func repository(
        _ repository: LensRepository,
        didFailToUpdateLensesForGroupID groupID: String,
        error: Error?
    ) {
        DispatchQueue.main.async {
            print("[KidiCameraKit] lens group \(groupID) failed: \(error?.localizedDescription ?? "unknown")")
            guard self.pendingLoadCall != nil else { return }
            self.receivedLoadGroups.insert(groupID)
            if self.receivedLoadGroups.isSuperset(of: self.pendingLoadGroups) {
                self.finishPendingLoad()
            }
        }
    }

    private func finishPendingLoad() {
        loadTimeoutWork?.cancel()
        loadTimeoutWork = nil
        guard let call = pendingLoadCall, let session = cameraKit else { return }
        pendingLoadCall = nil
        let lenses = collectLenses(from: session, groupIds: Array(pendingLoadGroups))
        resolveLenses(call, lenses: lenses)
    }

    private func collectLenses(from session: CameraKitSession, groupIds: [String]) -> [BridgeLens] {
        var result: [BridgeLens] = []
        for groupId in groupIds {
            for lens in session.lenses.repository.lenses(groupID: groupId) {
                lensByKey[lensKey(id: lens.id, groupId: lens.groupId)] = lens
                result.append(
                    BridgeLens(
                        id: lens.id,
                        groupId: lens.groupId,
                        name: lens.name ?? "Lens",
                        iconUrl: lens.iconUrl?.absoluteString,
                        previewUrl: nil
                    )
                )
            }
        }
        cachedLenses = result
        return result
    }

    private func resolveLenses(_ call: CAPPluginCall, lenses: [BridgeLens]) {
        let payload: [[String: Any?]] = lenses.map { [
            "id": $0.id,
            "groupId": $0.groupId,
            "name": $0.name,
            "iconUrl": $0.iconUrl,
            "previewUrl": $0.previewUrl,
        ] }
        call.resolve(["lenses": payload])
    }

    private func lensKey(id: String, groupId: String) -> String {
        "\(groupId)|\(id)"
    }
}

// MARK: - Helpers

private struct BridgeLens {
    let id: String
    let groupId: String
    let name: String
    let iconUrl: String?
    let previewUrl: String?
}
