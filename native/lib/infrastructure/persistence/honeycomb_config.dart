class HoneycombConfig {
  HoneycombConfig({
    required this.nodeId,
    required this.mode,
    required this.controlPlaneUrl,
    required this.controlPlaneHttpUrl,
    required this.authToken,
    required this.ownedHoneycomb,
    required this.autoStartAgents,
    required this.sdkCommand,
    required this.sdkLibraryPath,
  });

  final String nodeId;
  final String mode;
  final String controlPlaneUrl;
  final String controlPlaneHttpUrl;
  final String authToken;
  final bool ownedHoneycomb;
  final List<String> autoStartAgents;
  final String sdkCommand;
  final String sdkLibraryPath;

  static HoneycombConfig fromJson(Map<String, dynamic> json) => HoneycombConfig(
        nodeId: json['nodeId'] as String,
        mode: json['mode'] as String,
        controlPlaneUrl: json['controlPlaneUrl'] as String,
        controlPlaneHttpUrl: json['controlPlaneHttpUrl'] as String,
        authToken: json['authToken'] as String,
        ownedHoneycomb: json['ownedHoneycomb'] as bool? ?? true,
        autoStartAgents: (json['autoStartAgents'] as List<dynamic>? ?? const []).cast<String>(),
        sdkCommand: json['sdkCommand'] as String? ?? '',
        sdkLibraryPath: json['sdkLibraryPath'] as String? ?? '',
      );
}
