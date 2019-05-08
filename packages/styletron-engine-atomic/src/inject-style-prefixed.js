// @flow

declare var __DEV__: boolean;

import hyphenate from "./hyphenate-style-name.js";
import {validateNoMixedHand} from "./validate-no-mixed-hand.js";
import prefixAll from "inline-style-prefixer/static";

import type {StyleObject} from "styletron-standard";

import {MultiCache} from "./cache.js";

// Returns a string value that is a key of the matching supports brackets
// For a property. This is important where a component may have
// Multiple root level @supports brackets for different things
const isSupportedKey = (key, supports) => {
  let result = "";
  for (const [condition, block] of Object.entries(supports)) {
    if (Object.keys(block).indexOf(key) !== -1) {
      result += condition;
    }
  }
  return result.trim() === "" ? false : result;
};

export default function injectStylePrefixed(
  styleCache: MultiCache<{pseudo: string, block: string}>,
  styles: StyleObject,
  media: string,
  pseudo: string,
  supports: Object,
) {
  /**
   * Look ahead for @supports object and store it
   */
  const supported: Object = {};
  const supportsMap: Object = {...supports};
  // let supportsCondition;
  for (const key in styles) {
    if (key.includes("@supports")) {
      // This only gets used in this scope so it doesn't matter, we just use it for look up?
      // Need keys for multiple @supports declarations
      supported[`${media}${pseudo}${key}`] = styles[key];
    }
  }
  const cache = styleCache.getCache(media);
  let classString = "";
  /**
   * Reorder the styles so that the @supports object is last. This way you can't get caught with
   * styles that are outside the @supports overriding the @supports properties
   */
  for (const originalKey in styles) {
    const originalVal = styles[originalKey];
    // SUPPORTSCONDITION IS IF ORIGINALKEY INCLUDES @SUPPORTSS????

    // Check if this key is one that's supported
    // It could be supported in more than one root level supports
    const supportedKey = isSupportedKey(originalKey, supported);

    if (typeof originalVal !== "object") {
      // Primitive value
      if (__DEV__) {
        validateValueType(originalVal);
      }
      const propValPair = `${hyphenate(
        originalKey,
      )}:${((originalVal: any): string)}`;

      // originalKey or pseudo here... will be the key prefixed with media for supported?

      let key = supportedKey
        ? `${pseudo}${supportedKey}${hyphenate(
            originalKey,
          )}:${originalVal}:${hyphenate(originalKey)}:${
            supported[supportedKey][originalKey]
          }`
        : `${pseudo}${propValPair}`;

      if (supportedKey) {
        // Create a map of the nested @supports propValPairs against the cache key
        // This is so the cachedId can be passed along for rule insertion
        supportsMap[
          `${hyphenate(originalKey)}:${supported[supportedKey][originalKey]}`
        ] = {
          key,
        };
      }
      if (supports && supports[propValPair]) {
        key = supports[propValPair].key;
      }
      // Create a new ID for something like @supports (font-size: 4vw)font-size: 10px
      const cachedId = cache.cache[key];
      // If there is a cachedId from a support key then create a new key for that so
      // the cache addValue will fire
      if (supports && supports[propValPair] && cachedId) {
        key = `${cachedId}${supports[propValPair].key}`;
      }

      if (cachedId !== void 0 && key.indexOf("@supports") === -1) {
        // cache hit
        classString += " " + cachedId;
        continue;
      } else {
        // cache miss
        let block = "";
        const prefixed = prefixAll({[originalKey]: originalVal});
        for (const prefixedKey in prefixed) {
          const prefixedVal = prefixed[prefixedKey];
          const prefixedValType = typeof prefixedVal;
          if (prefixedValType === "string" || prefixedValType === "number") {
            const prefixedPair = `${hyphenate(prefixedKey)}:${prefixedVal}`;
            if (prefixedPair !== propValPair) {
              block += `${prefixedPair};`;
            }
          } else if (Array.isArray(prefixedVal)) {
            const hyphenated = hyphenate(prefixedKey);
            for (let i = 0; i < prefixedVal.length; i++) {
              const prefixedPair = `${hyphenated}:${prefixedVal[i]}`;
              if (prefixedPair !== propValPair) {
                block += `${prefixedPair};`;
              }
            }
          }
        }
        block += propValPair; // ensure original prop/val is last (for hydration)
        const id = cache.addValue(key, {pseudo, block, cachedId});
        classString += " " + id;
      }
    } else {
      // Object value
      if (
        originalKey[0] === ":" ||
        originalKey.substring(0, 9) === "@supports"
      ) {
        classString +=
          " " +
          injectStylePrefixed(
            styleCache,
            originalVal,
            media,
            pseudo + originalKey,
            supportsMap,
          );
      } else if (originalKey.substring(0, 6) === "@media") {
        classString +=
          " " +
          injectStylePrefixed(
            styleCache,
            originalVal,
            originalKey.substr(7),
            pseudo,
            supportsMap,
          );
      }
    }
  }

  if (__DEV__) {
    const conflicts = validateNoMixedHand(styles);
    if (conflicts.length) {
      conflicts.forEach(({shorthand, longhand}) => {
        const short = JSON.stringify({[shorthand.property]: shorthand.value});
        const long = JSON.stringify({[longhand.property]: longhand.value});
        // eslint-disable-next-line no-console
        console.warn(
          `Styles \`${short}\` and \`${long}\` in object yielding class "${classString.slice(
            1,
          )}" may result in unexpected behavior. Mixing shorthand and longhand properties within the same style object is unsupported with atomic rendering.`,
        );
      });
    }
  }

  // remove leading space
  return classString.slice(1);
}

function validateValueType(value) {
  if (
    value === null ||
    Array.isArray(value) ||
    (typeof value !== "number" && typeof value !== "string")
  ) {
    throw new Error(`Unsupported style value: ${JSON.stringify(value)}`);
  }
}
