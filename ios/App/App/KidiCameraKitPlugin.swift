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
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
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
    private var idleStopWork: DispatchWorkItem?

    /// Public Snap client token + default lens group. Used when JS omits
    /// arguments or Info.plist keys are missing from the built binary.
    private static let embeddedApiToken =
        "eyJhbGciOiJIUzI1NiIsImtpZCI6IkNhbnZhc1MyU0hNQUNQcm9kIiwidHlwIjoiSldUIn0.eyJhdWQiOiJjYW52YXMtY2FudmFzYXBpIiwiaXNzIjoiY2FudmFzLXMyc3Rva2VuIiwibmJmIjoxNzg0MDQzNzkxLCJzdWIiOiIxOWJhOGM5OC1jMDRhLTRlOTgtOGVkYi04YWM4ZDQyODUzMzN-UFJPRFVDVElPTn43OTRjMjZhNC02ZDg0LTQ5NGYtOGE4Ny04MmZkMmVkZDVmYTUifQ.YE50FTWYfbngNKJGigMDb-I_eVvfASwRF9NRsQ4MD_4"
    private static let embeddedGroupId = "df287f43-6646-4b01-a711-1a0e632c211a"

    override public func load() {
        let plistToken = (Bundle.main.object(forInfoDictionaryKey: "SCCameraKitAPIToken") as? String) ?? ""
        let plistGroup = (Bundle.main.object(forInfoDictionaryKey: "SCCameraKitLensGroupID") as? String) ?? ""
        print(
            "[KidiCameraKit] plugin loaded plistToken=\(!plistToken.isEmpty) " +
            "plistGroup=\(plistGroup.isEmpty ? "MISSING" : plistGroup) " +
            "embeddedFallback=true"
        )
        let payload: [String: Any] = [
            "ready": true,
            "plistToken": !plistToken.isEmpty,
            "plistGroup": plistGroup,
        ]
        DispatchQueue.main.async { [weak self] in
            self?.notifyListeners("pluginLoaded", data: payload)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
            self?.notifyListeners("pluginLoaded", data: payload)
        }
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        let plistToken = (Bundle.main.object(forInfoDictionaryKey: "SCCameraKitAPIToken") as? String) ?? ""
        let plistGroup = (Bundle.main.object(forInfoDictionaryKey: "SCCameraKitLensGroupID") as? String) ?? ""
        call.resolve([
            "ready": true,
            "initialized": isInitialized,
            "sessionStarted": sessionStarted,
            "captureRunning": captureSession?.isRunning ?? false,
            "plistToken": !plistToken.isEmpty,
            "plistGroup": plistGroup,
        ])
    }

    // MARK: - initialize

    @objc func initialize(_ call: CAPPluginCall) {
        let apiToken = call.getString("apiToken")
        let groupIds = call.getArray("groupIds", String.self)

        DispatchQueue.main.async {
            do {
                try self.bootstrapSession(apiToken: apiToken, groupIds: groupIds)
                self.emitStatus("initialized")
                call.resolve(["initialized": true])
            } catch {
                call.reject(error.localizedDescription)
            }
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
                    self.ensureSessionStarted(facing: self.cameraPosition == .front ? "user" : "environment") { _ in
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
            // Never reject here: the production JS falls back to WASM on any
            // reject, and startRunning can block while getUserMedia releases
            // the camera. Prepare the session, resolve immediately, start
            // capture in the background.
            do {
                try self.bootstrapSession(apiToken: nil, groupIds: nil)
            } catch {
                print("[KidiCameraKit] startPreview bootstrap: \(error.localizedDescription)")
            }
            self.ensureSessionStarted(facing: facing, waitForCapture: false) { _ in
                if let preview = self.previewView {
                    preview.transform = mirrored ? CGAffineTransform(scaleX: -1, y: 1) : .identity
                }
                print("[KidiCameraKit] startPreview mirrored=\(mirrored) facing=\(facing)")
                self.emitStatus("previewStarted", extra: [
                    "mirrored": mirrored,
                    "facing": facing,
                ])
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

        if !enabled {
            Task { @MainActor in
                await self.stopPublishing()
                call.resolve(["enabled": false])
            }
            return
        }

        guard let roomUrl, let token, !roomUrl.isEmpty, !token.isEmpty else {
            call.reject("Missing roomUrl or token")
            return
        }

        // Resolve as soon as the Camera Kit preview is up. The production JS
        // stays on « Connexion au live… » until this promise settles; LiveKit
        // connect/publish must not block it (and must not run exclusively on
        // the main actor — that can deadlock room.connect).
        DispatchQueue.main.async {
            do {
                try self.bootstrapSession(apiToken: nil, groupIds: nil)
            } catch {
                print("[KidiCameraKit] publish bootstrap: \(error.localizedDescription)")
            }
            self.ensureSessionStarted(
                facing: self.cameraPosition == .front ? "user" : "environment",
                waitForCapture: false
            ) { _ in
                print("[KidiCameraKit] setPublishEnabled preview ready")
                call.resolve(["enabled": true])
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    do {
                        try await self.startPublishing(url: roomUrl, token: token)
                    } catch {
                        print("[KidiCameraKit] background publish failed: \(error)")
                    }
                }
            }
        }
    }
}

// MARK: - Session lifecycle

private extension KidiCameraKitPlugin {
    func defaultApiToken() -> String {
        let plist = (Bundle.main.object(forInfoDictionaryKey: "SCCameraKitAPIToken") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return plist.isEmpty ? Self.embeddedApiToken : plist
    }

    func defaultGroupIds() -> [String] {
        let id = (Bundle.main.object(forInfoDictionaryKey: "SCCameraKitLensGroupID") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let resolved = id.isEmpty ? Self.embeddedGroupId : id
        return resolved.isEmpty ? [] : [resolved]
    }

    func bootstrapSession(apiToken: String?, groupIds: [String]?) throws {
        let token = (apiToken?.isEmpty == false ? apiToken : nil) ?? defaultApiToken()
        let groups = (groupIds?.isEmpty == false ? groupIds : nil) ?? defaultGroupIds()
        print(
            "[KidiCameraKit] bootstrap jsToken=\(apiToken?.isEmpty == false) " +
            "jsGroups=\(groupIds?.count ?? 0) usingTokenLen=\(token.count) groups=\(groups)"
        )
        guard !token.isEmpty else {
            throw NSError(
                domain: "KidiCameraKit",
                code: 5,
                userInfo: [NSLocalizedDescriptionKey: "Missing apiToken"]
            )
        }
        guard !groups.isEmpty else {
            throw NSError(
                domain: "KidiCameraKit",
                code: 6,
                userInfo: [NSLocalizedDescriptionKey: "Missing groupIds"]
            )
        }

        self.groupIds = groups
        if cameraKit == nil {
            let lensesConfig = LensesConfig(
                cacheConfig: CacheConfig(lensContentMaxSize: 150 * 1024 * 1024)
            )
            cameraKit = CameraKitSession(
                sessionConfig: SessionConfig(apiToken: token),
                lensesConfig: lensesConfig,
                errorHandler: nil
            )
        }
        guard let session = cameraKit else {
            throw NSError(
                domain: "KidiCameraKit",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Failed to create Camera Kit session"]
            )
        }
        for groupId in groups {
            session.lenses.repository.addObserver(self, groupID: groupId)
        }
        isInitialized = true
        print("[KidiCameraKit] initialized groups=\(groups.joined(separator: ","))")
        emitStatus("bootstrapped", extra: ["groups": groups.joined(separator: ",")])
    }

    func emitStatus(_ phase: String, extra: [String: Any] = [:]) {
        var data: [String: Any] = [
            "phase": phase,
            "initialized": isInitialized,
            "sessionStarted": sessionStarted,
            "captureRunning": captureSession?.isRunning ?? false,
        ]
        extra.forEach { data[$0.key] = $0.value }
        notifyListeners("status", data: data)
    }

    func ensureSessionStarted(facing: String, waitForCapture: Bool = true, completion: @escaping (Bool) -> Void) {
        cameraPosition = facing == "environment" ? .back : .front
        idleStopWork?.cancel()
        idleStopWork = nil

        guard let cameraKit else {
            print("[KidiCameraKit] ensureSessionStarted: session missing (call initialize first)")
            completion(false)
            return
        }

        requestCameraAccess { [weak self] granted in
            guard let self else { return }
            guard granted else {
                print("[KidiCameraKit] camera permission denied")
                completion(false)
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
                // Prefer Snap's default start (front + portrait). Avoids passing
                // AVCaptureVideoOrientation, which Apple deprecated in iOS 17 —
                // Snap's longer overloads still require that type in their headers.
                cameraKit.start(input: input, arInput: arInput)
                cameraKit.cameraPosition = self.cameraPosition
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

            if waitForCapture {
                self.startCaptureWithRetry(input: input, attempt: 0, completion: completion)
            } else {
                self.startCaptureWithRetry(input: input, attempt: 0) { running in
                    print("[KidiCameraKit] capture running=\(running)")
                }
                completion(true)
            }
        }
    }

    func startCaptureWithRetry(
        input: AVSessionInput,
        attempt: Int,
        completion: @escaping (Bool) -> Void
    ) {
        DispatchQueue.global(qos: .userInitiated).async {
            input.startRunning()
            let running = self.captureSession?.isRunning == true
            if !running && attempt < 5 {
                print("[KidiCameraKit] camera not running yet, retry \(attempt + 1)")
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                    self.startCaptureWithRetry(input: input, attempt: attempt + 1, completion: completion)
                }
                return
            }
            DispatchQueue.main.async {
                print("[KidiCameraKit] capture running=\(running) attempt=\(attempt)")
                self.notifyListeners("captureState", data: ["running": running])
                if !running {
                    print("[KidiCameraKit] camera failed to start after retries")
                }
                completion(running)
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
        // Punch through the React camera layer so PreviewView is visible
        // even before a web deploy updates Tailwind backgrounds.
        webView.evaluateJavaScript(
            """
            (function(){
              try {
                document.documentElement.classList.add('kp-native-ck');
                document.documentElement.style.background='transparent';
                if (document.body) document.body.style.background='transparent';
                var st=document.getElementById('kp-native-ck-style');
                if(!st){st=document.createElement('style');st.id='kp-native-ck-style';
                  (document.head||document.documentElement).appendChild(st);}
                st.textContent=[
                  'html.kp-native-ck,html.kp-native-ck body{background:transparent!important}',
                  'html.kp-native-ck [data-kp-native-cam],',
                  'html.kp-native-ck .kp-native-cam-root{background:transparent!important}'
                ].join('');
                document.querySelectorAll('[data-kp-native-cam],.kp-native-cam-root').forEach(function(el){
                  el.style.background='transparent';
                });
                document.querySelectorAll('video').forEach(function(v){
                  var p=v.parentElement;
                  if(p) p.style.background='transparent';
                  if(!v.srcObject && !v.currentSrc) v.style.opacity='0';
                });
              } catch (e) {}
            })();
            """,
            completionHandler: nil
        )
    }

    func teardownPreviewOnly() {
        previewView?.removeFromSuperview()
        // Delay stopping capture so setup → live does not kill the session
        // (CameraKitPreview unmounts and calls stopPreview first).
        idleStopWork?.cancel()
        guard !publishEnabled else { return }
        let work = DispatchWorkItem { [weak self] in
            guard let self, !self.publishEnabled else { return }
            self.sessionInput?.stopRunning()
            print("[KidiCameraKit] idle camera stopped")
        }
        idleStopWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5, execute: work)
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
        idleStopWork?.cancel()
        idleStopWork = nil

        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            do {
                try bootstrapSession(apiToken: nil, groupIds: nil)
            } catch {
                print("[KidiCameraKit] publish bootstrap: \(error.localizedDescription)")
            }
            ensureSessionStarted(
                facing: cameraPosition == .front ? "user" : "environment",
                waitForCapture: false
            ) { _ in
                cont.resume()
            }
        }

        guard isInitialized, let cameraKit else {
            throw NSError(
                domain: "KidiCameraKit",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Camera Kit session missing — call initialize() first"]
            )
        }

        let room = liveKitRoom ?? Room()
        liveKitRoom = room
        if room.connectionState != .connected {
            try await withTimeout(seconds: 12) {
                try await room.connect(url: url, token: token)
            }
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
        } else {
            // Re-bind after a previous stop; keep the same Output registered.
            output.capturer = capturer
        }

        // Prefer waiting for a filtered frame so LiveKit gets real dimensions,
        // but do not hard-fail: publish anyway so the host is never stuck on
        // « Connexion au live… » if the first buffer is slightly late.
        let gotFrame = await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
            var resumed = false
            output.onFirstFrame = {
                guard !resumed else { return }
                resumed = true
                cont.resume(returning: true)
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                guard !resumed else { return }
                resumed = true
                cont.resume(returning: false)
            }
        }
        if !gotFrame {
            print("[KidiCameraKit] no Camera Kit frame yet — publishing anyway")
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
        if let publication = liveKitRoom?.localParticipant.trackPublications.values
            .compactMap({ $0 as? LocalTrackPublication })
            .first(where: { $0.source == .camera })
        {
            try? await liveKitRoom?.localParticipant.unpublish(publication: publication)
        }
        liveKitVideoTrack = nil
        await liveKitRoom?.disconnect()
        liveKitRoom = nil
        if previewView?.superview == nil {
            sessionInput?.stopRunning()
        }
        print("[KidiCameraKit] LiveKit publish stopped")
    }

    func withTimeout<T>(
        seconds: TimeInterval,
        operation: @escaping @Sendable () async throws -> T
    ) async throws -> T {
        try await withThrowingTaskGroup(of: T.self) { group in
            group.addTask { try await operation() }
            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
                throw NSError(
                    domain: "KidiCameraKit",
                    code: 3,
                    userInfo: [NSLocalizedDescriptionKey: "Timed out after \(Int(seconds))s"]
                )
            }
            guard let result = try await group.next() else {
                throw NSError(
                    domain: "KidiCameraKit",
                    code: 3,
                    userInfo: [NSLocalizedDescriptionKey: "Timed out"]
                )
            }
            group.cancelAll()
            return result
        }
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
