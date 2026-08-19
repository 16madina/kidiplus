import Capacitor
import Foundation
import AVFoundation

// MARK: - KiDi+ Camera Kit native bridge
//
// Ce plugin Capacitor remplace le SDK web `@snap/camera-kit` sur iOS natif.
// Il fait tourner le moteur AR Snap directement avec le GPU natif, ce qui
// élimine les saccades causées par le rendu WASM dans la WebView pendant un live.
//
// Dépendances à ajouter dans le projet Xcode :
//   - Snap Camera Kit iOS SDK (SCSDKCameraKit) — via CocoaPods ou XCFramework.
//   - LiveKit iOS client SDK — déjà présent via Swift Package Manager.
//
// Le plugin gère :
//   - l'initialisation du SDK Snap avec le token API et le(s) groupe(s) de lenses
//   - le chargement des lenses disponibles
//   - l'application/retrait d'une lens
//   - l'aperçu caméra natif (preview) affichable derrière la WebView transparente
//   - la publication LiveKit du flux filtré (à finaliser dans une itération native)

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

    // TODO: remplacer par les vraies instances SCSDKCameraKit une fois le SDK ajouté.
    // private var cameraKitSession: Session?
    // private var cameraKitVideoSource: CameraKitVideoSource?
    // private var liveKitRoom: Room?

    private var isInitialized = false
    private var cachedLenses: [BridgeLens] = []
    private var previewLayer: AVCaptureVideoPreviewLayer?

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
            // TODO: intégrer SCSDKCameraKit
            // self.cameraKitSession = Session(sessionConfig: SessionConfig(apiToken: apiToken), lensesConfig: nil, errorHandler: nil)
            // for groupId in groupIds {
            //     self.cameraKitSession?.lenses.repository.addObserver(self, groupID: groupId)
            // }
            self.isInitialized = true
            print("[KidiCameraKit] initialized for groups: \(groupIds.joined(separator: ", "))")
            call.resolve(["initialized": true])
        }
    }

    // MARK: - loadLenses

    @objc func loadLenses(_ call: CAPPluginCall) {
        guard isInitialized else {
            call.reject("CameraKit not initialized — call initialize() first")
            return
        }
        guard let groupIds = call.getArray("groupIds", String.self), !groupIds.isEmpty else {
            call.reject("Missing groupIds")
            return
        }

        DispatchQueue.main.async {
            // TODO: récupérer les vraies lenses depuis SCSDKCameraKit
            // let allLenses = groupIds.flatMap { groupId in
            //     self.cameraKitSession?.lenses.repository.lenses(groupID: groupId) ?? []
            // }
            // self.cachedLenses = allLenses.map { BridgeLens(id: $0.id, groupId: $0.groupID, name: $0.name ?? "Lens", iconUrl: ... ) }

            // Placeholder : retourne une lens factice pour valider le bridge JS.
            self.cachedLenses = [
                BridgeLens(
                    id: "native-demo-lens",
                    groupId: groupIds.first ?? "",
                    name: "Native Demo Lens",
                    iconUrl: nil,
                    previewUrl: nil
                )
            ]

            let payload: [[String: Any?]] = self.cachedLenses.map { [
                "id": $0.id,
                "groupId": $0.groupId,
                "name": $0.name,
                "iconUrl": $0.iconUrl,
                "previewUrl": $0.previewUrl,
            ] }
            call.resolve(["lenses": payload])
        }
    }

    // MARK: - applyLens / clearLens

    @objc func applyLens(_ call: CAPPluginCall) {
        guard isInitialized else {
            call.reject("CameraKit not initialized")
            return
        }
        guard let lensId = call.getString("lensId"), !lensId.isEmpty else {
            call.reject("Missing lensId")
            return
        }
        let groupId = call.getString("groupId") ?? ""

        DispatchQueue.main.async {
            // TODO: appliquer la vraie lens SCSDKCameraKit
            // if let lens = self.cameraKitSession?.lenses.repository.lens(id: lensId, groupID: groupId) {
            //     self.cameraKitSession?.lenses.processor?.apply(lens: lens, launchData: nil) { success in ... }
            // }
            print("[KidiCameraKit] applyLens \(lensId) group \(groupId)")
            call.resolve(["applied": true])
        }
    }

    @objc func clearLens(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            // TODO: retirer la lens SCSDKCameraKit
            // self.cameraKitSession?.lenses.processor?.clear()
            print("[KidiCameraKit] clearLens")
            call.resolve(["cleared": true])
        }
    }

    // MARK: - preview

    @objc func startPreview(_ call: CAPPluginCall) {
        let mirrored = call.getBool("mirrored") ?? false
        let facing = call.getString("facing") ?? "user"

        DispatchQueue.main.async {
            // TODO: démarrer la session caméra AR avec SCSDKCameraKit et afficher la preview.
            // Pour l'instant on signale simplement que le bridge fonctionne.
            print("[KidiCameraKit] startPreview mirrored=\(mirrored) facing=\(facing)")
            call.resolve(["started": true])
        }
    }

    @objc func stopPreview(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            // TODO: arrêter la preview SCSDKCameraKit
            print("[KidiCameraKit] stopPreview")
            call.resolve(["stopped": true])
        }
    }

    // MARK: - LiveKit publishing

    @objc func setPublishEnabled(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        let roomUrl = call.getString("roomUrl")
        let token = call.getString("token")

        DispatchQueue.main.async {
            // TODO: connecter/publier avec le SDK LiveKit iOS natif en utilisant
            // la sortie vidéo de SCSDKCameraKit comme source personnalisée.
            //
            // if enabled {
            //     guard let roomUrl, let token else { call.reject("Missing roomUrl or token"); return }
            //     let room = Room(...)
            //     try await room.connect(url: roomUrl, token: token)
            //     let videoSource = CameraKitVideoSource(cameraKitSession: session)
            //     let localTrack = LocalVideoTrack.createVideoTrack(source: videoSource)
            //     try await room.localParticipant.publish(videoTrack: localTrack)
            // } else {
            //     liveKitRoom?.disconnect()
            // }
            print("[KidiCameraKit] setPublishEnabled=\(enabled) roomUrl=\(roomUrl ?? "nil")")
            call.resolve(["enabled": enabled])
        }
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
