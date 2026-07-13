import UIKit
import Capacitor

class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(LivePipPlugin())
        // Host the tiny PiP source view under the WebView.
        LivePipSession.shared.attach(to: view)
    }
}
