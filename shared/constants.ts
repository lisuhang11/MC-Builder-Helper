export const SCHEMA_VERSION = 1 as const;

/** 给用户看的经典大版本；注册表实际加载 JAVA_DATA_VERSION。 */
export const JAVA_VERSIONS = ["1.7.10", "1.8", "1.12", "1.16", "1.20"] as const;

export type JavaVersion = (typeof JAVA_VERSIONS)[number];

/** minecraft-data 需要精确版本号，对外不展示。 */
export const JAVA_DATA_VERSION: Record<JavaVersion, string> = {
  "1.7.10": "1.7",
  "1.8": "1.8.9",
  "1.12": "1.12.2",
  "1.16": "1.16.5",
  "1.20": "1.20.1",
};

export const EDITIONS = ["java", "bedrock"] as const;
export type Edition = (typeof EDITIONS)[number];

export const MAX_OCCUPIED_CELLS = 2048;
export const MAX_AXIS_SPAN = 48;
export const GENERATE_MAX_ATTEMPTS = 4;

/** 产品意图；unclear 只作系统兜底。 */
export const INTENTS = ["greeting", "ask_mc", "generate_build", "howto_build"] as const;
export type Intent = (typeof INTENTS)[number];
export type IntentResult = Intent | "unclear";

export const INTENT_LABELS: Record<IntentResult, string> = {
  greeting: "打招呼",
  ask_mc: "询问 MC 知识",
  generate_build: "生成建筑",
  howto_build: "查建造方法",
  unclear: "意图不明",
};

export function isIntent(value: string): value is Intent {
  return (INTENTS as readonly string[]).includes(value);
}

export function isJavaVersion(value: string): value is JavaVersion {
  return (JAVA_VERSIONS as readonly string[]).includes(value);
}

const LEGACY_VERSION: Record<string, JavaVersion> = {
  "1.7": "1.7.10",
  "1.8.9": "1.8",
  "1.12.2": "1.12",
  "1.16.5": "1.16",
  "1.20.1": "1.20",
  "1.21": "1.20",
  "1.21.1": "1.20",
};

export function coerceJavaVersion(value: string): JavaVersion {
  if (isJavaVersion(value)) return value;
  return LEGACY_VERSION[value] ?? "1.20";
}

export function isPreFlattenVersion(version: string): boolean {
  return version === "1.7.10" || version === "1.8" || version === "1.12";
}

export function dataVersionOf(version: string): string {
  if (isJavaVersion(version)) return JAVA_DATA_VERSION[version];
  return version;
}
