export type OcctFormat = "step" | "iges" | "brep";
export type OcctJSExactElementKind = "face" | "edge" | "vertex";
export type OcctJSExactGeometryFamily = "line" | "circle" | "plane" | "cylinder" | "sphere" | "cone" | "torus" | "other";
export type OcctJSImportColorMode = "source" | "default";
export type OcctJSImportAppearancePreset = "cad-solid" | "cad-ghosted";

export interface OcctJSColor {
    r: number;
    g: number;
    b: number;
    opacity?: number;
}

export interface OcctJSFace {
    id: number;
    name: string;
    firstIndex: number;
    indexCount: number;
    edgeIndices: number[];
    color: OcctJSColor | null;
}

export interface OcctJSEdge {
    id: number;
    name: string;
    points: Float32Array;
    ownerFaceIds: number[];
    isFreeEdge: boolean;
    color: OcctJSColor | null;
}

export interface OcctJSVertex {
    id: number;
    position: [number, number, number];
}

export interface OcctJSGeometry {
    id: string;
    name: string;
    color: OcctJSColor | null;
    positions: Float32Array;
    normals: Float32Array;
    indices: Uint32Array;
    faces: OcctJSFace[];
    edges: OcctJSEdge[];
    vertices: OcctJSVertex[];
    triangleToFaceMap: Int32Array;
}

export interface OcctJSMaterial {
    r: number;
    g: number;
    b: number;
    opacity?: number;
}

export interface OcctJSNode {
    id: string;
    name: string;
    isAssembly: boolean;
    transform: number[];
    meshes: number[];
    children: OcctJSNode[];
}

export interface OcctJSStats {
    rootCount: number;
    nodeCount: number;
    partCount: number;
    geometryCount: number;
    materialCount: number;
    triangleCount: number;
    reusedInstanceCount: number;
}

export interface OcctJSResult {
    success: boolean;
    error?: string;
    sourceFormat: string;
    sourceUnit?: string;
    unitScaleToMeters?: number;
    rootNodes?: OcctJSNode[];
    geometries?: OcctJSGeometry[];
    materials?: OcctJSMaterial[];
    warnings?: unknown[];
    stats?: OcctJSStats;
}

export type OcctJSStepProductInspectionStatus = "ok" | "error";
export type OcctJSStepProductClassification = "single_part" | "assembly" | "multi_part" | "ambiguous";
export type OcctJSStepProductInspectionErrorCode = "unsupported_format" | "read_failed" | "no_shapes" | "internal_error" | string;

export interface OcctJSStepProductInspectionMessage {
    code: string;
    message: string;
    severity?: string;
    nodeId?: string;
}

export interface OcctJSStepProductInspectionNode {
    id: string;
    name: string;
    kind: "assembly" | "part" | string;
    isAssembly: boolean;
    isReference: boolean;
    hasShape: boolean;
    selectable: boolean;
    occurrenceRef: string;
    partRef: string;
    displayPath: string[];
    transform: number[];
    occurrenceTransform: number[];
    children: OcctJSStepProductInspectionNode[];
}

export interface OcctJSStepSelectableOccurrence {
    kind: "occurrence";
    occurrenceRef: string;
    partRef: string;
    nodeId: string;
    name: string;
    displayPath: string[];
    localTransform: number[];
    occurrenceTransform: number[];
    sourceUnit?: string;
    unitScaleToMeters?: number;
}

export interface OcctJSStepProductInspectionError {
    code: OcctJSStepProductInspectionErrorCode;
    message: string;
}

export interface OcctJSStepProductInspectionSuccess {
    status: "ok";
    sourceFormat: "step";
    classification: OcctJSStepProductClassification;
    rootCount: number;
    uniquePartCount: number;
    partOccurrenceCount: number;
    assemblyPresent: boolean;
    selectableOccurrences: OcctJSStepSelectableOccurrence[];
    productTree: OcctJSStepProductInspectionNode[];
    reasons: OcctJSStepProductInspectionMessage[];
    warnings: OcctJSStepProductInspectionMessage[];
    sourceUnit?: string;
    unitScaleToMeters?: number;
}

export interface OcctJSStepProductInspectionFailure {
    status: "error";
    sourceFormat: "step";
    error: OcctJSStepProductInspectionError;
}

export type OcctJSStepProductInspectionResult =
    | OcctJSStepProductInspectionSuccess
    | OcctJSStepProductInspectionFailure;

export type OcctJSStepPartImportRejectionCode =
    | "assembly_not_allowed"
    | "multi_part_not_allowed"
    | "ambiguous_product_structure"
    | "inspection_failed"
    | "selection_not_found"
    | "selection_not_leaf_occurrence"
    | "selection_missing_shape"
    | "selection_ambiguous"
    | "selection_import_failed"
    | "selection_not_supported"
    | "selection_required"
    | "unsupported_export_format"
    | "export_failed"
    | "import_failed";

export type OcctJSStepPartImportSelection =
    | { kind: "part"; partRef: string }
    | { kind: "occurrence"; occurrenceRef: string };

export interface OcctJSStepPartImportParams extends OcctJSReadParams {
    selection?: OcctJSStepPartImportSelection | null;
}

export type OcctJSStepPartExportFormat = "brep";

export interface OcctJSStepPartExportParams extends OcctJSStepPartImportParams {
    exportFormat?: OcctJSStepPartExportFormat;
}

export interface OcctJSStepPartImportRejection {
    code: OcctJSStepPartImportRejectionCode;
    message: string;
    classification?: OcctJSStepProductClassification;
    rootCount?: number;
    uniquePartCount?: number;
    partOccurrenceCount?: number;
    assemblyPresent?: boolean;
    inspectionErrorCode?: OcctJSStepProductInspectionErrorCode;
}

export interface OcctJSStepSelectedOccurrence extends OcctJSStepSelectableOccurrence {}

export interface OcctJSStepPartImportSuccess extends OcctJSResult {
    success: true;
    sourceFormat: "step";
    rootNodes: OcctJSNode[];
    geometries: OcctJSGeometry[];
    materials: OcctJSMaterial[];
    stats: OcctJSStats;
    inspection: OcctJSStepProductInspectionSuccess;
    selectedOccurrence?: OcctJSStepSelectedOccurrence;
}

export interface OcctJSStepPartImportFailure {
    success: false;
    sourceFormat: "step";
    error: string;
    rejection: OcctJSStepPartImportRejection;
    inspection?: OcctJSStepProductInspectionResult;
}

export type OcctJSStepPartImportResult =
    | OcctJSStepPartImportSuccess
    | OcctJSStepPartImportFailure;

export interface OcctJSStepPartExportSuccess {
    success: true;
    sourceFormat: "step";
    format: "brep";
    content: Uint8Array;
    inspection: OcctJSStepProductInspectionSuccess;
    selectedOccurrence: OcctJSStepSelectedOccurrence;
}

export interface OcctJSStepPartExportFailure extends OcctJSStepPartImportFailure {
    format?: string;
}

export type OcctJSStepPartExportResult =
    | OcctJSStepPartExportSuccess
    | OcctJSStepPartExportFailure;

export interface OcctJSImportTimings {
    readMs: number;
    transferMs: number;
    meshMs: number;
    extractMs: number;
    outputMs: number;
    totalMs: number;
}

export interface OcctJSExactOpenResult extends OcctJSResult {
    timings?: OcctJSImportTimings;
    exactModelId?: number;
    exactGeometryBindings?: OcctJSExactGeometryBinding[];
}

export interface OcctJSExactGeometryBinding {
    geometryId: string;
    exactShapeHandle: number;
}

export interface OcctJSLifecycleSuccess {
    ok: true;
}

export interface OcctJSLifecycleFailure {
    ok: false;
    code: string;
    message: string;
}

export type OcctJSLifecycleResult = OcctJSLifecycleSuccess | OcctJSLifecycleFailure;

export interface OcctJSExactModelDiagnosticsEntry {
    exactModelId: number;
    refCount: number;
    sourceFormat: string;
    sourceUnit: string;
    unitScaleToMeters: number;
    exactGeometryCount: number;
}

export interface OcctJSExactModelDiagnostics {
    liveExactModelCount: number;
    releasedHandleCount: number;
    liveExactModels: OcctJSExactModelDiagnosticsEntry[];
}

export interface OcctJSExactQueryFailure {
    ok: false;
    code: string;
    message: string;
}

export type OcctJSExactPairwiseFailureCode =
    | "invalid-handle"
    | "released-handle"
    | "invalid-id"
    | "unsupported-geometry"
    | "parallel-geometry"
    | "coincident-geometry"
    | "insufficient-precision"
    | "internal-error";

export interface OcctJSExactPairwiseFailure {
    ok: false;
    code: OcctJSExactPairwiseFailureCode;
    message: string;
}

export interface OcctJSExactGeometryTypeSuccess {
    ok: true;
    family: OcctJSExactGeometryFamily;
}

export type OcctJSExactGeometryTypeResult = OcctJSExactGeometryTypeSuccess | OcctJSExactQueryFailure;

export interface OcctJSExactRadiusSuccess {
    ok: true;
    family: "circle" | "cylinder" | "sphere";
    radius: number;
    diameter: number;
    localCenter: [number, number, number];
    localAnchorPoint: [number, number, number];
    localAxisDirection: [number, number, number];
}

export type OcctJSExactRadiusResult = OcctJSExactRadiusSuccess | OcctJSExactQueryFailure;

export interface OcctJSExactCenterSuccess {
    ok: true;
    family: "circle" | "cylinder" | "sphere" | "cone" | "torus";
    localCenter: [number, number, number];
    localAxisDirection: [number, number, number];
}

export type OcctJSExactCenterResult = OcctJSExactCenterSuccess | OcctJSExactQueryFailure;

export interface OcctJSExactEdgeLengthSuccess {
    ok: true;
    value: number;
    localStartPoint: [number, number, number];
    localEndPoint: [number, number, number];
}

export type OcctJSExactEdgeLengthResult = OcctJSExactEdgeLengthSuccess | OcctJSExactQueryFailure;

export interface OcctJSExactFaceAreaSuccess {
    ok: true;
    value: number;
    localCentroid: [number, number, number];
}

export type OcctJSExactFaceAreaResult = OcctJSExactFaceAreaSuccess | OcctJSExactQueryFailure;

export interface OcctJSExactFaceNormalSuccess {
    ok: true;
    localPoint: [number, number, number];
    localNormal: [number, number, number];
}

export type OcctJSExactFaceNormalResult = OcctJSExactFaceNormalSuccess | OcctJSExactQueryFailure;

export type OcctJSMatrix4 = [
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
    number, number, number, number
];

export interface OcctJSExactDistanceSuccess {
    ok: true;
    value: number;
    pointA: [number, number, number];
    pointB: [number, number, number];
    workingPlaneOrigin: [number, number, number];
    workingPlaneNormal: [number, number, number];
}

export type OcctJSExactDistanceResult = OcctJSExactDistanceSuccess | OcctJSExactPairwiseFailure;

export interface OcctJSExactAngleSuccess {
    ok: true;
    value: number;
    origin: [number, number, number];
    directionA: [number, number, number];
    directionB: [number, number, number];
    pointA: [number, number, number];
    pointB: [number, number, number];
    workingPlaneOrigin: [number, number, number];
    workingPlaneNormal: [number, number, number];
}

export type OcctJSExactAngleResult = OcctJSExactAngleSuccess | OcctJSExactPairwiseFailure;

export interface OcctJSExactThicknessSuccess {
    ok: true;
    value: number;
    pointA: [number, number, number];
    pointB: [number, number, number];
    workingPlaneOrigin: [number, number, number];
    workingPlaneNormal: [number, number, number];
}

export type OcctJSExactThicknessResult = OcctJSExactThicknessSuccess | OcctJSExactPairwiseFailure;

export type OcctJSExactPlacementKind = "distance" | "angle" | "radius" | "diameter" | "thickness";

export interface OcctJSExactPlacementFrame {
    origin: [number, number, number];
    normal: [number, number, number];
    xDir: [number, number, number];
    yDir: [number, number, number];
}

export interface OcctJSExactPlacementAnchor {
    role: "attach" | "center" | "anchor" | "entry" | "exit" | "bottom" | "support-a" | "support-b";
    point: [number, number, number];
}

export interface OcctJSExactPlacementSuccess {
    ok: true;
    kind: OcctJSExactPlacementKind;
    value?: number;
    frame: OcctJSExactPlacementFrame;
    anchors: OcctJSExactPlacementAnchor[];
    directionA?: [number, number, number];
    directionB?: [number, number, number];
    axisDirection?: [number, number, number];
}

export type OcctJSExactPlacementResult = OcctJSExactPlacementSuccess | OcctJSExactPairwiseFailure;

export type OcctJSExactRelationKind =
    | "parallel"
    | "perpendicular"
    | "concentric"
    | "tangent"
    | "none";

export interface OcctJSExactRelationSuccess {
    ok: true;
    kind: OcctJSExactRelationKind;
    frame?: OcctJSExactPlacementFrame;
    anchors?: OcctJSExactPlacementAnchor[];
    directionA?: [number, number, number];
    directionB?: [number, number, number];
    center?: [number, number, number];
    axisDirection?: [number, number, number];
    tangentPoint?: [number, number, number];
}

export type OcctJSExactRelationResult = OcctJSExactRelationSuccess | OcctJSExactPairwiseFailure;

export interface OcctJSExactHoleSuccess {
    ok: true;
    kind: "hole";
    profile: "cylindrical";
    radius: number;
    diameter: number;
    frame?: OcctJSExactPlacementFrame;
    anchors?: OcctJSExactPlacementAnchor[];
    axisDirection?: [number, number, number];
    depth?: number;
    isThrough?: boolean;
}

export type OcctJSExactHoleResult = OcctJSExactHoleSuccess | OcctJSExactQueryFailure;

export interface OcctJSExactChamferSuccess {
    ok: true;
    kind: "chamfer";
    profile: "planar";
    variant: "equal-distance" | "two-distance";
    distanceA: number;
    distanceB: number;
    supportAngle: number;
    frame?: OcctJSExactPlacementFrame;
    anchors?: OcctJSExactPlacementAnchor[];
    edgeDirection?: [number, number, number];
    supportNormalA?: [number, number, number];
    supportNormalB?: [number, number, number];
}

export type OcctJSExactChamferResult = OcctJSExactChamferSuccess | OcctJSExactQueryFailure;

export interface OcctJSExactCompoundHoleSuccess {
    ok: true;
    kind: "compound-hole";
    family: "counterbore" | "countersink";
    holeDiameter: number;
    holeDepth?: number;
    isThrough?: boolean;
    frame?: OcctJSExactPlacementFrame;
    anchors?: OcctJSExactPlacementAnchor[];
    axisDirection?: [number, number, number];
    counterboreDiameter?: number;
    counterboreDepth?: number;
    countersinkDiameter?: number;
    countersinkAngle?: number;
}

export type OcctJSExactCompoundHoleResult = OcctJSExactCompoundHoleSuccess | OcctJSExactQueryFailure;

export type OcctJSProfile2DSegmentKind = "line" | "arc_center" | "arc_3pt";
export type OcctJSProfile2DDiagnosticCode =
    | "build-failed"
    | "degenerate-segment"
    | "invalid-arc"
    | "invalid-spec"
    | "invalid-type"
    | "missing-field"
    | "non-finite-coordinate"
    | "profile-discontinuous"
    | "profile-not-closed"
    | "unsupported-segment-kind"
    | "unsupported-version";

export interface OcctJSProfile2DSegmentBase {
    id?: string;
    tag?: string;
    end: [number, number];
}

export interface OcctJSProfile2DLineSegment extends OcctJSProfile2DSegmentBase {
    kind: "line";
}

export interface OcctJSProfile2DArcCenterSegment extends OcctJSProfile2DSegmentBase {
    kind: "arc_center";
    center: [number, number];
}

export interface OcctJSProfile2DArc3PointSegment extends OcctJSProfile2DSegmentBase {
    kind: "arc_3pt";
    through: [number, number];
}

export type OcctJSProfile2DSegment =
    | OcctJSProfile2DLineSegment
    | OcctJSProfile2DArcCenterSegment
    | OcctJSProfile2DArc3PointSegment;

export interface OcctJSProfile2DSpec {
    version?: 1;
    start: [number, number];
    segments: OcctJSProfile2DSegment[];
}

export interface OcctJSProfile2DDiagnostic {
    code: OcctJSProfile2DDiagnosticCode;
    message: string;
    severity: "error";
    path?: string;
    segmentIndex?: number;
}

export interface OcctJSProfile2DValidationResult {
    ok: boolean;
    diagnostics: OcctJSProfile2DDiagnostic[];
}

export type OcctJSRevolvedShapeUnits = "mm" | "inch";
export type OcctJSRevolvedShapePlane = "XZ";
export type OcctJSRevolvedShapeClosure = "explicit" | "auto_axis";
export type OcctJSRevolvedShapeSegmentKind = OcctJSProfile2DSegmentKind;
export type OcctJSRevolvedShapeDiagnosticCode =
    | OcctJSProfile2DDiagnosticCode
    | "invalid-closure"
    | "invalid-revolve-angle"
    | "negative-radius"
    | "unsupported-plane"
    | "unsupported-unit";

export type OcctJSRevolvedShapeSegment = OcctJSProfile2DSegment;

export interface OcctJSRevolvedShapeSpec {
    version?: 1;
    units: OcctJSRevolvedShapeUnits;
    profile: OcctJSProfile2DSpec & {
        plane?: OcctJSRevolvedShapePlane;
        closure: OcctJSRevolvedShapeClosure;
    };
    revolve?: {
        angleDeg?: number;
    };
}

export type OcctJSRevolvedShapeDiagnostic = Omit<OcctJSProfile2DDiagnostic, "code"> & {
    code: OcctJSRevolvedShapeDiagnosticCode;
};

export interface OcctJSRevolvedShapeValidationResult {
    ok: boolean;
    diagnostics: OcctJSRevolvedShapeDiagnostic[];
}

export interface OcctJSRevolvedShapeBuildOptions {
    linearDeflectionType?: "bounding_box_ratio" | "absolute_value";
    linearDeflection?: number;
    angularDeflection?: number;
}

export interface OcctJSGeneratedShapeSegmentDescriptor {
    index: number;
    kind: OcctJSProfile2DSegmentKind;
    id?: string;
    tag?: string;
}

export interface OcctJSGeneratedShapeExactShapeValidation {
    isValid: boolean;
    isClosed: boolean;
    isSolid: boolean;
    shapeType: string;
    solidCount: number;
    shellCount: number;
    faceCount: number;
    edgeCount: number;
    vertexCount: number;
}

export interface OcctJSGeneratedShapeMeshValidation {
    isWatertight: boolean;
    isManifold: boolean;
    weldedVertexCount: number;
    boundaryEdgeCount: number;
    nonManifoldEdgeCount: number;
}

export interface OcctJSGeneratedShapeShapeValidation {
    exact: OcctJSGeneratedShapeExactShapeValidation;
    mesh: OcctJSGeneratedShapeMeshValidation;
}

export type OcctJSGeneratedRevolvedShapeSegmentDescriptor = OcctJSGeneratedShapeSegmentDescriptor;
export type OcctJSGeneratedRevolvedShapeSystemRole =
    | "profile"
    | "closure"
    | "axis"
    | "start_cap"
    | "end_cap"
    | "degenerated";

export interface OcctJSGeneratedRevolvedShapeFaceBinding {
    geometryIndex: number;
    faceId: number;
    systemRole: OcctJSGeneratedRevolvedShapeSystemRole;
    segmentIndex?: number;
    segmentId?: string;
    segmentTag?: string;
}

export type OcctJSGeneratedRevolvedShapeExactShapeValidation = OcctJSGeneratedShapeExactShapeValidation;
export type OcctJSGeneratedRevolvedShapeMeshValidation = OcctJSGeneratedShapeMeshValidation;
export type OcctJSGeneratedRevolvedShapeShapeValidation = OcctJSGeneratedShapeShapeValidation;

export interface OcctJSGeneratedRevolvedShapeMetadata {
    version: 1;
    units: OcctJSRevolvedShapeUnits;
    plane: OcctJSRevolvedShapePlane;
    closure: OcctJSRevolvedShapeClosure;
    angleDeg: number;
    segmentCount: number;
    hasStableFaceBindings: boolean;
    segments: OcctJSGeneratedRevolvedShapeSegmentDescriptor[];
    shapeValidation?: OcctJSGeneratedRevolvedShapeShapeValidation;
    faceBindings?: OcctJSGeneratedRevolvedShapeFaceBinding[];
}

export interface OcctJSRevolvedShapeBuildFailure {
    success: false;
    error: string;
    sourceFormat: "generated-revolved-shape";
    diagnostics: OcctJSRevolvedShapeDiagnostic[];
    revolvedShape?: OcctJSGeneratedRevolvedShapeMetadata;
}

export interface OcctJSRevolvedShapeBuildSuccess extends OcctJSResult {
    success: true;
    sourceFormat: "generated-revolved-shape";
    revolvedShape: OcctJSGeneratedRevolvedShapeMetadata;
    diagnostics?: OcctJSRevolvedShapeDiagnostic[];
}

export type OcctJSRevolvedShapeBuildResult =
    | OcctJSRevolvedShapeBuildFailure
    | OcctJSRevolvedShapeBuildSuccess;

export interface OcctJSExactRevolvedShapeOpenSuccess extends OcctJSExactOpenResult {
    success: true;
    sourceFormat: "generated-revolved-shape";
    exactModelId: number;
    exactGeometryBindings: OcctJSExactGeometryBinding[];
    revolvedShape: OcctJSGeneratedRevolvedShapeMetadata;
    diagnostics?: OcctJSRevolvedShapeDiagnostic[];
}

export type OcctJSExactRevolvedShapeOpenResult =
    | OcctJSRevolvedShapeBuildFailure
    | OcctJSExactRevolvedShapeOpenSuccess;

export type OcctJSExtrudedShapeUnits = "mm" | "inch";
export type OcctJSExtrudedShapeSegmentKind = OcctJSProfile2DSegmentKind;
export type OcctJSExtrudedShapeDiagnosticCode =
    | OcctJSProfile2DDiagnosticCode
    | "invalid-extrusion-depth"
    | "unsupported-unit";

export interface OcctJSExtrudedShapeSpec {
    version?: 1;
    units: OcctJSExtrudedShapeUnits;
    profile: OcctJSProfile2DSpec;
    extrusion?: {
        depth: number;
    };
}

export type OcctJSExtrudedShapeDiagnostic = Omit<OcctJSProfile2DDiagnostic, "code"> & {
    code: OcctJSExtrudedShapeDiagnosticCode;
};

export interface OcctJSExtrudedShapeValidationResult {
    ok: boolean;
    diagnostics: OcctJSExtrudedShapeDiagnostic[];
}

export interface OcctJSExtrudedShapeBuildOptions {
    linearDeflectionType?: "bounding_box_ratio" | "absolute_value";
    linearDeflection?: number;
    angularDeflection?: number;
}

export type OcctJSGeneratedExtrudedShapeSegmentDescriptor = OcctJSGeneratedShapeSegmentDescriptor;
export type OcctJSGeneratedExtrudedShapeSystemRole =
    | "wall"
    | "start_cap"
    | "end_cap";

export interface OcctJSGeneratedExtrudedShapeFaceBinding {
    geometryIndex: number;
    faceId: number;
    systemRole: OcctJSGeneratedExtrudedShapeSystemRole;
    segmentIndex?: number;
    segmentId?: string;
    segmentTag?: string;
}

export interface OcctJSGeneratedExtrudedShapeMetadata {
    version: 1;
    units: OcctJSExtrudedShapeUnits;
    depth: number;
    segmentCount: number;
    hasStableFaceBindings: boolean;
    segments: OcctJSGeneratedExtrudedShapeSegmentDescriptor[];
    shapeValidation?: OcctJSGeneratedShapeShapeValidation;
    faceBindings?: OcctJSGeneratedExtrudedShapeFaceBinding[];
}

export interface OcctJSExtrudedShapeBuildFailure {
    success: false;
    error: string;
    sourceFormat: "generated-extruded-shape";
    diagnostics: OcctJSExtrudedShapeDiagnostic[];
    extrudedShape?: OcctJSGeneratedExtrudedShapeMetadata;
}

export interface OcctJSExtrudedShapeBuildSuccess extends OcctJSResult {
    success: true;
    sourceFormat: "generated-extruded-shape";
    extrudedShape: OcctJSGeneratedExtrudedShapeMetadata;
    diagnostics?: OcctJSExtrudedShapeDiagnostic[];
}

export type OcctJSExtrudedShapeBuildResult =
    | OcctJSExtrudedShapeBuildFailure
    | OcctJSExtrudedShapeBuildSuccess;

export interface OcctJSExactExtrudedShapeOpenSuccess extends OcctJSExactOpenResult {
    success: true;
    sourceFormat: "generated-extruded-shape";
    exactModelId: number;
    exactGeometryBindings: OcctJSExactGeometryBinding[];
    extrudedShape: OcctJSGeneratedExtrudedShapeMetadata;
    diagnostics?: OcctJSExtrudedShapeDiagnostic[];
}

export type OcctJSExactExtrudedShapeOpenResult =
    | OcctJSExtrudedShapeBuildFailure
    | OcctJSExactExtrudedShapeOpenSuccess;

export type OcctJSHelicalSweepUnits = "mm" | "inch";
export type OcctJSHelicalSweepHandedness = "right" | "left";
export type OcctJSHelicalSweepSectionKind = "circle" | "polyline";
export type OcctJSHelicalSweepDiagnosticCode =
    | "invalid-spec"
    | "invalid-type"
    | "missing-field"
    | "unsupported-version"
    | "unsupported-unit"
    | "invalid-helix-radius"
    | "invalid-helix-pitch"
    | "invalid-helix-turns"
    | "invalid-handedness"
    | "unsupported-section-kind"
    | "invalid-section-radius"
    | "invalid-section-segments"
    | "invalid-section-points"
    | "build-failed";

export interface OcctJSHelicalSweepCircleSection {
    kind: "circle";
    radius: number;
    segments?: number;
}

export interface OcctJSHelicalSweepPolylineSection {
    kind: "polyline";
    points: Array<[number, number]>;
}

export type OcctJSHelicalSweepSection =
    | OcctJSHelicalSweepCircleSection
    | OcctJSHelicalSweepPolylineSection;

export interface OcctJSHelicalSweepSpec {
    version?: 1;
    units: OcctJSHelicalSweepUnits;
    helix: {
        radius: number;
        pitch: number;
        turns: number;
        handedness?: OcctJSHelicalSweepHandedness;
    };
    section: OcctJSHelicalSweepSection;
}

export type OcctJSHelicalSweepDiagnostic = Omit<OcctJSProfile2DDiagnostic, "code"> & {
    code: OcctJSHelicalSweepDiagnosticCode;
};

export interface OcctJSHelicalSweepValidationResult {
    ok: boolean;
    diagnostics: OcctJSHelicalSweepDiagnostic[];
}

export interface OcctJSHelicalSweepBuildOptions {
    linearDeflectionType?: "bounding_box_ratio" | "absolute_value";
    linearDeflection?: number;
    angularDeflection?: number;
}

export type OcctJSGeneratedHelicalSweepSystemRole =
    | "sweep"
    | "start_cap"
    | "end_cap";

export interface OcctJSGeneratedHelicalSweepFaceBinding {
    geometryIndex: number;
    faceId: number;
    systemRole: OcctJSGeneratedHelicalSweepSystemRole;
    segmentIndex?: number;
    segmentId?: string;
    segmentTag?: string;
}

export interface OcctJSGeneratedHelicalSweepMetadata {
    version: 1;
    units: OcctJSHelicalSweepUnits;
    helixRadius: number;
    pitch: number;
    turns: number;
    height: number;
    handedness: OcctJSHelicalSweepHandedness;
    sectionKind: OcctJSHelicalSweepSectionKind;
    sectionRadius: number;
    sectionSegments: number;
    sectionPointCount: number;
    hasStableFaceBindings: boolean;
    shapeValidation?: OcctJSGeneratedShapeShapeValidation;
    faceBindings?: OcctJSGeneratedHelicalSweepFaceBinding[];
}

export interface OcctJSHelicalSweepBuildFailure {
    success: false;
    error: string;
    sourceFormat: "generated-helical-sweep";
    diagnostics: OcctJSHelicalSweepDiagnostic[];
    helicalSweep?: OcctJSGeneratedHelicalSweepMetadata;
}

export interface OcctJSHelicalSweepBuildSuccess extends OcctJSResult {
    success: true;
    sourceFormat: "generated-helical-sweep";
    helicalSweep: OcctJSGeneratedHelicalSweepMetadata;
    diagnostics?: OcctJSHelicalSweepDiagnostic[];
}

export type OcctJSHelicalSweepBuildResult =
    | OcctJSHelicalSweepBuildFailure
    | OcctJSHelicalSweepBuildSuccess;

export interface OcctJSExactHelicalSweepOpenSuccess extends OcctJSExactOpenResult {
    success: true;
    sourceFormat: "generated-helical-sweep";
    exactModelId: number;
    exactGeometryBindings: OcctJSExactGeometryBinding[];
    helicalSweep: OcctJSGeneratedHelicalSweepMetadata;
    diagnostics?: OcctJSHelicalSweepDiagnostic[];
}

export type OcctJSExactHelicalSweepOpenResult =
    | OcctJSHelicalSweepBuildFailure
    | OcctJSExactHelicalSweepOpenSuccess;

export type OcctJSCompositeShapeUnits = "mm" | "inch";
export type OcctJSCompositeOperandFamily = "revolved" | "extruded" | "helical-sweep";
export type OcctJSCompositeShapeStepOp = "fuse" | "cut";
export type OcctJSCompositeShapeDiagnosticCode =
    | "invalid-spec"
    | "invalid-type"
    | "missing-field"
    | "unsupported-version"
    | "unsupported-unit"
    | "unsupported-operand-family"
    | "unsupported-step-op"
    | "invalid-transform"
    | "operand-unit-mismatch"
    | "operand-build-failed"
    | "build-failed"
    | OcctJSRevolvedShapeDiagnosticCode
    | OcctJSExtrudedShapeDiagnosticCode
    | OcctJSHelicalSweepDiagnosticCode;

export interface OcctJSCompositeShapeRevolvedOperandSpec {
    family: "revolved";
    spec: OcctJSRevolvedShapeSpec;
    transform?: OcctJSMatrix4;
}

export interface OcctJSCompositeShapeExtrudedOperandSpec {
    family: "extruded";
    spec: OcctJSExtrudedShapeSpec;
    transform?: OcctJSMatrix4;
}

export interface OcctJSCompositeShapeHelicalOperandSpec {
    family: "helical-sweep";
    spec: OcctJSHelicalSweepSpec;
    transform?: OcctJSMatrix4;
}

export type OcctJSCompositeShapeOperandSpec =
    | OcctJSCompositeShapeRevolvedOperandSpec
    | OcctJSCompositeShapeExtrudedOperandSpec
    | OcctJSCompositeShapeHelicalOperandSpec;

export interface OcctJSCompositeShapeStepSpec {
    op: OcctJSCompositeShapeStepOp;
    operand: OcctJSCompositeShapeOperandSpec;
}

export interface OcctJSCompositeShapeSpec {
    version?: 1;
    units: OcctJSCompositeShapeUnits;
    seed: OcctJSCompositeShapeOperandSpec;
    steps?: OcctJSCompositeShapeStepSpec[];
}

export type OcctJSCompositeShapeDiagnostic = Omit<OcctJSProfile2DDiagnostic, "code"> & {
    code: OcctJSCompositeShapeDiagnosticCode;
};

export interface OcctJSCompositeShapeValidationResult {
    ok: boolean;
    diagnostics: OcctJSCompositeShapeDiagnostic[];
}

export interface OcctJSCompositeShapeBuildOptions {
    linearDeflectionType?: "bounding_box_ratio" | "absolute_value";
    linearDeflection?: number;
    angularDeflection?: number;
}

export interface OcctJSGeneratedCompositeShapeOperationDescriptor {
    index: number;
    op: OcctJSCompositeShapeStepOp;
    family: OcctJSCompositeOperandFamily;
    hasTransform: boolean;
}

export interface OcctJSGeneratedCompositeShapeMetadata {
    version: 1;
    units: OcctJSCompositeShapeUnits;
    seedFamily: OcctJSCompositeOperandFamily;
    stepCount: number;
    operations: OcctJSGeneratedCompositeShapeOperationDescriptor[];
    shapeValidation?: OcctJSGeneratedShapeShapeValidation;
}

export interface OcctJSCompositeShapeBuildFailure {
    success: false;
    error: string;
    sourceFormat: "generated-composite-shape";
    diagnostics: OcctJSCompositeShapeDiagnostic[];
    compositeShape?: OcctJSGeneratedCompositeShapeMetadata;
}

export interface OcctJSCompositeShapeBuildSuccess extends OcctJSResult {
    success: true;
    sourceFormat: "generated-composite-shape";
    compositeShape: OcctJSGeneratedCompositeShapeMetadata;
    diagnostics?: OcctJSCompositeShapeDiagnostic[];
}

export type OcctJSCompositeShapeBuildResult =
    | OcctJSCompositeShapeBuildFailure
    | OcctJSCompositeShapeBuildSuccess;

export interface OcctJSExactCompositeShapeOpenSuccess extends OcctJSExactOpenResult {
    success: true;
    sourceFormat: "generated-composite-shape";
    exactModelId: number;
    exactGeometryBindings: OcctJSExactGeometryBinding[];
    compositeShape: OcctJSGeneratedCompositeShapeMetadata;
    diagnostics?: OcctJSCompositeShapeDiagnostic[];
}

export type OcctJSExactCompositeShapeOpenResult =
    | OcctJSCompositeShapeBuildFailure
    | OcctJSExactCompositeShapeOpenSuccess;

export interface OcctJSReadParams {
    rootMode?: "one-shape" | "multiple-shapes";
    linearUnit?: "millimeter" | "centimeter" | "meter" | "inch" | "foot";
    linearDeflectionType?: "bounding_box_ratio" | "absolute_value";
    linearDeflection?: number;
    angularDeflection?: number;
    readNames?: boolean;
    // Legacy toggle. This is legacy-only when colorMode is omitted.
    readColors?: boolean;
    // Named default-appearance bundle. "cad-solid" keeps the built-in CAD base
    // color [0.9, 0.91, 0.93] opaque, while "cad-ghosted" applies the same base
    // color with the built-in ghost opacity 0.35. Presets resolve before explicit
    // defaultColor/defaultOpacity overrides and are ignored by colorMode="source".
    appearancePreset?: OcctJSImportAppearancePreset;
    // Explicit appearance contract. When provided, this overrides readColors.
    // "default" uses the built-in CAD base color [0.9, 0.91, 0.93].
    colorMode?: OcctJSImportColorMode;
    // Optional RGB override for default appearance mode.
    // This only applies when colorMode is set to "default".
    defaultColor?: OcctJSColor;
    // Optional opacity override for default appearance mode. When omitted, any
    // preset-derived opacity is preserved; otherwise the default appearance stays opaque.
    // This only applies when colorMode is set to "default".
    defaultOpacity?: number;
}

export interface OcctJSOrientationPresetAxis {
    origin?: [number, number, number];
    direction?: [number, number, number];
}

export type OcctJSOrientationBboxCoordinate = "min" | "center" | "max" | "bottom" | "middle" | "top";

export type OcctJSOrientationOrigin =
    | "preserve"
    | "bbox-center-bottom"
    | "bbox-min-bottom"
    | "bbox-max-bottom"
    | "bbox-center"
    | "bbox-min"
    | "bbox-max"
    | {
        kind: "bbox";
        x?: OcctJSOrientationBboxCoordinate;
        y?: OcctJSOrientationBboxCoordinate;
        z?: OcctJSOrientationBboxCoordinate;
    };

export interface OcctJSOrientationParams {
    linearUnit?: "millimeter" | "centimeter" | "meter" | "inch" | "foot";
    mode?: "manufacturing";
    origin?: OcctJSOrientationOrigin;
    presetAxis?: OcctJSOrientationPresetAxis;
}

export interface OcctJSOrientationFrame {
    origin: [number, number, number];
    xDir: [number, number, number];
    yDir: [number, number, number];
    zDir: [number, number, number];
}

export interface OcctJSOrientationBbox {
    dx: number;
    dy: number;
    dz: number;
}

export interface OcctJSOrientationStage1 {
    baseFaceId?: number;
    usedCylinderSupport: boolean;
    detectedAxis: [number, number, number];
}

export interface OcctJSOrientationStage2 {
    rotationAroundZDeg: number;
}

export interface OcctJSOrientationResult {
    success: boolean;
    error?: string;
    transform?: number[];
    localFrame?: OcctJSOrientationFrame;
    bbox?: OcctJSOrientationBbox;
    strategy?: string;
    stage1?: OcctJSOrientationStage1;
    stage2?: OcctJSOrientationStage2;
    confidence?: number;
    sourceUnit?: string;
    unitScaleToMeters?: number;
}

export type OcctJSGeometryTransformFormat = "step" | "stp" | "brep";

export interface OcctJSGeometryTransformSuccess {
    success: true;
    format: OcctJSGeometryTransformFormat;
    content: Uint8Array;
}

export interface OcctJSGeometryTransformFailure {
    success: false;
    format: string;
    error: string;
}

export type OcctJSGeometryTransformResult =
    | OcctJSGeometryTransformSuccess
    | OcctJSGeometryTransformFailure;

export interface OcctJSModule {
    ReadFile(format: string, content: Uint8Array, params?: OcctJSReadParams): OcctJSResult;
    ReadStepFile(content: Uint8Array, params?: OcctJSReadParams): OcctJSResult;
    InspectStepProduct(content: Uint8Array, params?: OcctJSReadParams): OcctJSStepProductInspectionResult;
    ReadStepPartFile(content: Uint8Array, params?: OcctJSStepPartImportParams): OcctJSStepPartImportResult;
    ExportStepPartFile(content: Uint8Array, params?: OcctJSStepPartExportParams): OcctJSStepPartExportResult;
    ReadIgesFile(content: Uint8Array, params?: OcctJSReadParams): OcctJSResult;
    ReadBrepFile(content: Uint8Array, params?: OcctJSReadParams): OcctJSResult;
    TransformFile(format: OcctJSGeometryTransformFormat, content: Uint8Array, transform: OcctJSMatrix4, params?: OcctJSReadParams): OcctJSGeometryTransformResult;
    TransformStepFile(content: Uint8Array, transform: OcctJSMatrix4, params?: OcctJSReadParams): OcctJSGeometryTransformResult;
    TransformBrepFile(content: Uint8Array, transform: OcctJSMatrix4, params?: OcctJSReadParams): OcctJSGeometryTransformResult;
    ValidateProfile2DSpec(spec: OcctJSProfile2DSpec): OcctJSProfile2DValidationResult;
    ValidateRevolvedShapeSpec(spec: OcctJSRevolvedShapeSpec): OcctJSRevolvedShapeValidationResult;
    ValidateExtrudedShapeSpec(spec: OcctJSExtrudedShapeSpec): OcctJSExtrudedShapeValidationResult;
    ValidateHelicalSweepSpec(spec: OcctJSHelicalSweepSpec): OcctJSHelicalSweepValidationResult;
    ValidateCompositeShapeSpec(spec: OcctJSCompositeShapeSpec): OcctJSCompositeShapeValidationResult;
    BuildRevolvedShape(spec: OcctJSRevolvedShapeSpec, options?: OcctJSRevolvedShapeBuildOptions): OcctJSRevolvedShapeBuildResult;
    BuildExtrudedShape(spec: OcctJSExtrudedShapeSpec, options?: OcctJSExtrudedShapeBuildOptions): OcctJSExtrudedShapeBuildResult;
    BuildHelicalSweep(spec: OcctJSHelicalSweepSpec, options?: OcctJSHelicalSweepBuildOptions): OcctJSHelicalSweepBuildResult;
    BuildCompositeShape(spec: OcctJSCompositeShapeSpec, options?: OcctJSCompositeShapeBuildOptions): OcctJSCompositeShapeBuildResult;
    OpenExactRevolvedShape(spec: OcctJSRevolvedShapeSpec, options?: OcctJSRevolvedShapeBuildOptions): OcctJSExactRevolvedShapeOpenResult;
    OpenExactExtrudedShape(spec: OcctJSExtrudedShapeSpec, options?: OcctJSExtrudedShapeBuildOptions): OcctJSExactExtrudedShapeOpenResult;
    OpenExactHelicalSweep(spec: OcctJSHelicalSweepSpec, options?: OcctJSHelicalSweepBuildOptions): OcctJSExactHelicalSweepOpenResult;
    OpenExactCompositeShape(spec: OcctJSCompositeShapeSpec, options?: OcctJSCompositeShapeBuildOptions): OcctJSExactCompositeShapeOpenResult;
    OpenExactModel(format: string, content: Uint8Array, params?: OcctJSReadParams): OcctJSExactOpenResult;
    OpenExactStepModel(content: Uint8Array, params?: OcctJSReadParams): OcctJSExactOpenResult;
    OpenExactIgesModel(content: Uint8Array, params?: OcctJSReadParams): OcctJSExactOpenResult;
    OpenExactBrepModel(content: Uint8Array, params?: OcctJSReadParams): OcctJSExactOpenResult;
    RetainExactModel(exactModelId: number): OcctJSLifecycleResult;
    ReleaseExactModel(exactModelId: number): OcctJSLifecycleResult;
    GetExactModelDiagnostics(): OcctJSExactModelDiagnostics;
    GetExactGeometryType(exactModelId: number, exactShapeHandle: number, kind: OcctJSExactElementKind, elementId: number): OcctJSExactGeometryTypeResult;
    MeasureExactRadius(exactModelId: number, exactShapeHandle: number, kind: OcctJSExactElementKind, elementId: number): OcctJSExactRadiusResult;
    MeasureExactCenter(exactModelId: number, exactShapeHandle: number, kind: OcctJSExactElementKind, elementId: number): OcctJSExactCenterResult;
    MeasureExactEdgeLength(exactModelId: number, exactShapeHandle: number, kind: OcctJSExactElementKind, elementId: number): OcctJSExactEdgeLengthResult;
    MeasureExactFaceArea(exactModelId: number, exactShapeHandle: number, kind: OcctJSExactElementKind, elementId: number): OcctJSExactFaceAreaResult;
    EvaluateExactFaceNormal(exactModelId: number, exactShapeHandle: number, kind: OcctJSExactElementKind, elementId: number, localQueryPoint: [number, number, number]): OcctJSExactFaceNormalResult;
    MeasureExactDistance(exactModelId: number, exactShapeHandleA: number, kindA: OcctJSExactElementKind, elementIdA: number, exactShapeHandleB: number, kindB: OcctJSExactElementKind, elementIdB: number, transformA: OcctJSMatrix4, transformB: OcctJSMatrix4): OcctJSExactDistanceResult;
    MeasureExactDistanceCrossModel(exactModelIdA: number, exactShapeHandleA: number, kindA: OcctJSExactElementKind, elementIdA: number, transformA: OcctJSMatrix4, exactModelIdB: number, exactShapeHandleB: number, kindB: OcctJSExactElementKind, elementIdB: number, transformB: OcctJSMatrix4): OcctJSExactDistanceResult;
    MeasureExactAngle(exactModelId: number, exactShapeHandleA: number, kindA: OcctJSExactElementKind, elementIdA: number, exactShapeHandleB: number, kindB: OcctJSExactElementKind, elementIdB: number, transformA: OcctJSMatrix4, transformB: OcctJSMatrix4): OcctJSExactAngleResult;
    MeasureExactAngleCrossModel(exactModelIdA: number, exactShapeHandleA: number, kindA: OcctJSExactElementKind, elementIdA: number, transformA: OcctJSMatrix4, exactModelIdB: number, exactShapeHandleB: number, kindB: OcctJSExactElementKind, elementIdB: number, transformB: OcctJSMatrix4): OcctJSExactAngleResult;
    MeasureExactThickness(exactModelId: number, exactShapeHandleA: number, kindA: OcctJSExactElementKind, elementIdA: number, exactShapeHandleB: number, kindB: OcctJSExactElementKind, elementIdB: number, transformA: OcctJSMatrix4, transformB: OcctJSMatrix4): OcctJSExactThicknessResult;
    MeasureExactThicknessCrossModel(exactModelIdA: number, exactShapeHandleA: number, kindA: OcctJSExactElementKind, elementIdA: number, transformA: OcctJSMatrix4, exactModelIdB: number, exactShapeHandleB: number, kindB: OcctJSExactElementKind, elementIdB: number, transformB: OcctJSMatrix4): OcctJSExactThicknessResult;
    ClassifyExactRelation(exactModelId: number, exactShapeHandleA: number, kindA: OcctJSExactElementKind, elementIdA: number, exactShapeHandleB: number, kindB: OcctJSExactElementKind, elementIdB: number, transformA: OcctJSMatrix4, transformB: OcctJSMatrix4): OcctJSExactRelationResult;
    ClassifyExactRelationCrossModel(exactModelIdA: number, exactShapeHandleA: number, kindA: OcctJSExactElementKind, elementIdA: number, transformA: OcctJSMatrix4, exactModelIdB: number, exactShapeHandleB: number, kindB: OcctJSExactElementKind, elementIdB: number, transformB: OcctJSMatrix4): OcctJSExactRelationResult;
    SuggestExactDistancePlacement(exactModelId: number, exactShapeHandleA: number, kindA: OcctJSExactElementKind, elementIdA: number, exactShapeHandleB: number, kindB: OcctJSExactElementKind, elementIdB: number, transformA: OcctJSMatrix4, transformB: OcctJSMatrix4): OcctJSExactPlacementResult;
    SuggestExactDistancePlacementCrossModel(exactModelIdA: number, exactShapeHandleA: number, kindA: OcctJSExactElementKind, elementIdA: number, transformA: OcctJSMatrix4, exactModelIdB: number, exactShapeHandleB: number, kindB: OcctJSExactElementKind, elementIdB: number, transformB: OcctJSMatrix4): OcctJSExactPlacementResult;
    SuggestExactAnglePlacement(exactModelId: number, exactShapeHandleA: number, kindA: OcctJSExactElementKind, elementIdA: number, exactShapeHandleB: number, kindB: OcctJSExactElementKind, elementIdB: number, transformA: OcctJSMatrix4, transformB: OcctJSMatrix4): OcctJSExactPlacementResult;
    SuggestExactAnglePlacementCrossModel(exactModelIdA: number, exactShapeHandleA: number, kindA: OcctJSExactElementKind, elementIdA: number, transformA: OcctJSMatrix4, exactModelIdB: number, exactShapeHandleB: number, kindB: OcctJSExactElementKind, elementIdB: number, transformB: OcctJSMatrix4): OcctJSExactPlacementResult;
    SuggestExactThicknessPlacement(exactModelId: number, exactShapeHandleA: number, kindA: OcctJSExactElementKind, elementIdA: number, exactShapeHandleB: number, kindB: OcctJSExactElementKind, elementIdB: number, transformA: OcctJSMatrix4, transformB: OcctJSMatrix4): OcctJSExactPlacementResult;
    SuggestExactThicknessPlacementCrossModel(exactModelIdA: number, exactShapeHandleA: number, kindA: OcctJSExactElementKind, elementIdA: number, transformA: OcctJSMatrix4, exactModelIdB: number, exactShapeHandleB: number, kindB: OcctJSExactElementKind, elementIdB: number, transformB: OcctJSMatrix4): OcctJSExactPlacementResult;
    SuggestExactRadiusPlacement(exactModelId: number, exactShapeHandle: number, kind: OcctJSExactElementKind, elementId: number): OcctJSExactPlacementResult;
    SuggestExactDiameterPlacement(exactModelId: number, exactShapeHandle: number, kind: OcctJSExactElementKind, elementId: number): OcctJSExactPlacementResult;
    DescribeExactHole(exactModelId: number, exactShapeHandle: number, kind: OcctJSExactElementKind, elementId: number): OcctJSExactHoleResult;
    DescribeExactChamfer(exactModelId: number, exactShapeHandle: number, kind: OcctJSExactElementKind, elementId: number): OcctJSExactChamferResult;
    DescribeExactCompoundHole(exactModelId: number, exactShapeHandle: number, kind: OcctJSExactElementKind, elementId: number): OcctJSExactCompoundHoleResult;
    AnalyzeOptimalOrientation(format: OcctFormat, content: Uint8Array, params?: OcctJSOrientationParams): OcctJSOrientationResult;
}

declare function OcctJS(options?: {
    locateFile?: (filename: string, scriptDirectory?: string) => string;
    wasmBinary?: ArrayBuffer | Uint8Array;
    onProgress?: (stage: "read" | "transfer" | "mesh" | "extract" | "output") => void;
}): Promise<OcctJSModule>;

export default OcctJS;
