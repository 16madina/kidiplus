import AVFoundation
import CoreMedia
import Foundation
import LiveKit
import SCSDKCameraKit

/// Reçoit les frames filtrées Camera Kit (CMSampleBuffer) et les pousse vers LiveKit.
final class KidiCameraKitLiveKitOutput: NSObject, Output, OutputRequiringPixelBuffer {
    var currentlyRequiresPixelBuffer: Bool = true {
        didSet {
            if currentlyRequiresPixelBuffer != oldValue {
                delegate?.outputChangedRequirements(self)
            }
        }
    }

    weak var delegate: SCCameraKitOutputRequiringPixelBufferDelegate?
    weak var capturer: BufferCapturer?
    private(set) var didEmitFrame = false

    func resetFrameFlag() {
        didEmitFrame = false
    }
    var onFirstFrame: (() -> Void)?

    func cameraKit(_ cameraKit: CameraKitProtocol, didOutputTexture texture: Texture) {
        // PreviewView consomme les textures ; nous avons besoin des sample buffers.
    }

    func cameraKit(_ cameraKit: CameraKitProtocol, didOutputVideoSampleBuffer sampleBuffer: CMSampleBuffer) {
        capturer?.capture(sampleBuffer)
        if !didEmitFrame {
            didEmitFrame = true
            onFirstFrame?()
        }
    }

    func cameraKit(_ cameraKit: CameraKitProtocol, didOutputAudioSampleBuffer sampleBuffer: CMSampleBuffer) {
        // Audio publié via le micro LiveKit natif (LocalAudioTrack).
    }
}
