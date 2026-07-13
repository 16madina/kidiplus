import AVKit
import Capacitor
import Foundation

/**
 * Capacitor bridge mirroring Android `LivePip`.
 * On iOS, setEnabled(true, { url, token }) connects a native LiveKit viewer
 * and enables system PiP when the app backgrounds.
 */
@objc(LivePipPlugin)
public class LivePipPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LivePipPlugin"
    public let jsName = "LivePip"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enter", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "dismiss", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isInPip", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        LivePipSession.shared.setModeListener { [weak self] active in
            self?.notifyListeners("pipModeChange", data: ["active": active])
        }
    }

    @objc func setEnabled(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        let url = call.getString("url")
        let token = call.getString("token")
        Task {
            await LivePipSession.shared.setEligible(enabled, url: url, token: token)
            call.resolve(["enabled": enabled])
        }
    }

    @objc func enter(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            LivePipSession.shared.startPipIfPossible()
            call.resolve(["entered": LivePipSession.shared.isInPip])
        }
    }

    @objc func dismiss(_ call: CAPPluginCall) {
        Task {
            let dismissed = await LivePipSession.shared.dismiss()
            call.resolve(["dismissed": dismissed])
        }
    }

    @objc func isInPip(_ call: CAPPluginCall) {
        call.resolve(["value": LivePipSession.shared.isInPip])
    }

    @objc func isSupported(_ call: CAPPluginCall) {
        call.resolve(["value": LivePipSession.shared.isSupported])
    }
}
