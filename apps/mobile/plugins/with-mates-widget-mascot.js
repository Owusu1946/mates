const fs = require("node:fs");
const path = require("node:path");
const { withDangerousMod, withXcodeProject } = require("expo/config-plugins");

const TARGET_NAME = "ExpoWidgetsTarget";
const CATALOG_NAME = "Assets.xcassets";
const IMAGE_SET_NAME = "MatesMascot.imageset";
const MATE_MASCOTS = [
  { name: "kwame", imageSet: "KwameMascot.imageset", source: "kwame.png" },
  { name: "kofi", imageSet: "KofiMascot.imageset", source: "kofi.png" },
  { name: "ama", imageSet: "AmaMascot.imageset", source: "ama.png" },
  { name: "kojo", imageSet: "KojoMascot.imageset", source: "kojo.png" },
  { name: "kwesi", imageSet: "KwesiMascot.imageset", source: "kwesi.png" },
];

function withMatesWidgetMascot(config) {
  config = withDangerousMod(config, ["ios", async (modConfig) => {
    const projectRoot = modConfig.modRequest.platformProjectRoot;
    const source = path.join(modConfig.modRequest.projectRoot, "assets/macosts/mascot-hexagon-widget.png");
    const catalog = path.join(projectRoot, TARGET_NAME, CATALOG_NAME);
    const imageSet = path.join(catalog, IMAGE_SET_NAME);

    fs.mkdirSync(imageSet, { recursive: true });
    fs.copyFileSync(source, path.join(imageSet, "mascot.png"));
    fs.writeFileSync(path.join(catalog, "Contents.json"), JSON.stringify({
      info: { author: "xcode", version: 1 },
    }, null, 2));
    fs.writeFileSync(path.join(imageSet, "Contents.json"), JSON.stringify({
      images: [{ filename: "mascot.png", idiom: "universal", scale: "3x" }],
      info: { author: "xcode", version: 1 },
      properties: { "template-rendering-intent": "original" },
    }, null, 2));

    for (const mascot of MATE_MASCOTS) {
      const mateImageSet = path.join(catalog, mascot.imageSet);
      fs.mkdirSync(mateImageSet, { recursive: true });
      fs.copyFileSync(
        path.join(modConfig.modRequest.projectRoot, "assets/macosts", mascot.source),
        path.join(mateImageSet, "mascot.png"),
      );
      fs.writeFileSync(path.join(mateImageSet, "Contents.json"), JSON.stringify({
        images: [{ filename: "mascot.png", idiom: "universal", scale: "3x" }],
        info: { author: "xcode", version: 1 },
        properties: { "template-rendering-intent": "original" },
      }, null, 2));
    }

    return modConfig;
  }]);

  return withXcodeProject(config, (modConfig) => {
    const project = modConfig.modResults;
    const targets = project.pbxNativeTargetSection();
    const targetEntry = Object.entries(targets).find(([, target]) => target.name === TARGET_NAME);
    if (!targetEntry) throw new Error(`Could not find the ${TARGET_NAME} Xcode target`);
    const [targetUuid, target] = targetEntry;

    const groups = project.hash.project.objects.PBXGroup;
    const targetGroup = Object.entries(groups).find(([, group]) =>
      group.name === TARGET_NAME && group.path === TARGET_NAME
    );
    if (!targetGroup) throw new Error(`Could not find the ${TARGET_NAME} Xcode group`);

    const resourcePhaseExists = target.buildPhases.some((phase) =>
      phase.comment === "Resources" && project.hash.project.objects.PBXResourcesBuildPhase?.[phase.value]
    );
    if (!resourcePhaseExists) {
      project.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", targetUuid);
    }

    const catalogPath = CATALOG_NAME;
    if (!project.hasFile(catalogPath)) {
      project.addResourceFile(catalogPath, {
        target: targetUuid,
        lastKnownFileType: "folder.assetcatalog",
      }, targetGroup[0]);
    }

    return modConfig;
  });
}

module.exports = withMatesWidgetMascot;
