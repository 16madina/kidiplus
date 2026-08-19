import UIKit
import Capacitor

class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(LivePipPlugin())
        bridge?.registerPluginInstance(KidiCameraKitPlugin())
        // Host the tiny PiP source view under the WebView.
        LivePipSession.shared.attach(to: view)
    }
}
