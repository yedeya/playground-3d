import Foundation
import SceneKit
import Metal
import AppKit

// usage: render3 model outDir cx cy cz dist azDeg:elDeg:name [azDeg:elDeg:name ...]
// Lit render of the clean model, so individual boards stay distinguishable.
let a = CommandLine.arguments
let scene = try SCNScene(url: URL(fileURLWithPath: a[1]), options: nil)
let outDir = a[2]
let c = SCNVector3(Double(a[3])!, Double(a[4])!, Double(a[5])!)
let d = CGFloat(Double(a[6])!)
let (mn, mx) = scene.rootNode.boundingBox
print("bbox", mn, mx)
scene.background.contents = NSColor(white: 0.93, alpha: 1)
let amb = SCNNode(); amb.light = SCNLight(); amb.light!.type = .ambient; amb.light!.intensity = 450
scene.rootNode.addChildNode(amb)
for (p, i) in [(SCNVector3(3, 6, 5), CGFloat(800)), (SCNVector3(-5, 4, -2), CGFloat(350))] {
    let n = SCNNode(); n.light = SCNLight(); n.light!.type = .directional; n.light!.intensity = i
    n.position = p; n.look(at: SCNVector3(0, 1, 0), up: SCNVector3(0, 1, 0), localFront: SCNVector3(0, 0, -1))
    scene.rootNode.addChildNode(n)
}
let cam = SCNNode(); cam.camera = SCNCamera(); cam.camera!.zFar = 100; cam.camera!.zNear = 0.01; cam.camera!.fieldOfView = 45
scene.rootNode.addChildNode(cam)
let r = SCNRenderer(device: MTLCreateSystemDefaultDevice()!, options: nil)
r.scene = scene; r.pointOfView = cam
for spec in a[7...] {
    let s = spec.split(separator: ":")
    let az = CGFloat(Double(s[0])!) * .pi / 180, el = CGFloat(Double(s[1])!) * .pi / 180
    cam.position = SCNVector3(c.x + d*cos(el)*sin(az), c.y + d*sin(el), c.z + d*cos(el)*cos(az))
    cam.look(at: c, up: SCNVector3(0, 1, 0), localFront: SCNVector3(0, 0, -1))
    let img = r.snapshot(atTime: 0, with: CGSize(width: 900, height: 900), antialiasingMode: .multisampling4X)
    try NSBitmapImageRep(data: img.tiffRepresentation!)!.representation(using: .jpeg, properties: [.compressionFactor: 0.92])!
        .write(to: URL(fileURLWithPath: "\(outDir)/\(s[2]).jpg"))
}
print("rendered", a.count - 7)
