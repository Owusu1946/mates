const { withMod } = require("expo/config-plugins");

const CLERK_IOS_PACKAGE_URL = "https://github.com/clerk/clerk-ios.git";
// Keep aligned with the ClerkKit version declared by @clerk/expo 4.10.0's podspec.
const CLERK_IOS_VERSION = "1.6.1";
const SHARE_TARGET_NAME = "MatesShareExtension";
const PRODUCT_NAME = "ClerkKit";

function addClerkKitToShareTarget(project, xcode) {
  const target = [...project.values()].find(
    (object) => xcode.PBXNativeTarget.is(object) && object.props.name === SHARE_TARGET_NAME,
  );

  if (!target) {
    throw new Error(`Could not find the ${SHARE_TARGET_NAME} Xcode target`);
  }

  const packageReference = [...project.values()].find(
    (object) =>
      xcode.XCRemoteSwiftPackageReference.is(object) &&
      object.props.repositoryURL === CLERK_IOS_PACKAGE_URL,
  );
  const resolvedPackageReference =
    packageReference ??
    xcode.XCRemoteSwiftPackageReference.create(project, {
      repositoryURL: CLERK_IOS_PACKAGE_URL,
      requirement: { kind: "exactVersion", version: CLERK_IOS_VERSION },
    });

  if (!packageReference) {
    project.rootObject.props.packageReferences ??= [];
    project.rootObject.props.packageReferences.push(resolvedPackageReference);
  }

  const productDependency = [...project.values()].find(
    (object) =>
      xcode.XCSwiftPackageProductDependency.is(object) &&
      object.props.package.uuid === resolvedPackageReference.uuid &&
      object.props.productName === PRODUCT_NAME,
  ) ?? xcode.XCSwiftPackageProductDependency.create(project, {
    package: resolvedPackageReference,
    productName: PRODUCT_NAME,
  });

  target.props.packageProductDependencies ??= [];
  if (!target.props.packageProductDependencies.some(({ uuid }) => uuid === productDependency.uuid)) {
    target.props.packageProductDependencies.push(productDependency);
  }

  const frameworksPhase = target.getFrameworksBuildPhase();
  const productBuildFile = [...project.values()].find(
    (object) =>
      xcode.PBXBuildFile.is(object) && object.props.productRef?.uuid === productDependency.uuid,
  ) ?? project.createModel({ isa: "PBXBuildFile", productRef: productDependency });

  if (!frameworksPhase.props.files.some(({ uuid }) => uuid === productBuildFile.uuid)) {
    frameworksPhase.props.files.push(productBuildFile);
  }

  return project;
}

module.exports = function withMatesShareClerk(config) {
  return withMod(config, {
    platform: "ios",
    mod: "xcodeProjectBeta2",
    action: (mod) => {
      const appleTargets = require.resolve("@bacons/apple-targets/package.json");
      const xcode = require(require.resolve("@bacons/xcode", { paths: [appleTargets] }));
      mod.modResults = addClerkKitToShareTarget(mod.modResults, xcode);
      return mod;
    },
  });
};
