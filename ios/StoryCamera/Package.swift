// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "StoryCamera",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "StoryCamera", targets: ["StoryCamera"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.3.1")
    ],
    targets: [
        .target(
            name: "StoryCamera",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "Sources/StoryCamera"
        )
    ]
)
