import { descending } from 'd3-array';
import cloud from 'd3-cloud';
import React, { useEffect, useRef } from 'react';
import seedrandom from 'seedrandom';
import debounce from 'lodash.debounce';

import { useResponsiveSVGSelection } from './hooks';
import render from './render';
import * as types from './types';
import { getDefaultColors, getFontScale, getText, rotate } from './utils';
import { createCloud, CloudHandlers } from './cloud';

const MAX_LAYOUT_ATTEMPTS = 10;
const SHRINK_FACTOR = 0.95;

export * from './types';

export const defaultCallbacks: types.Callbacks = {
  getWordTooltip: ({ text, value }) => `${text} (${value})`,
};

export const defaultOptions: types.Options = {
  colors: getDefaultColors(),
  deterministic: false,
  enableTooltip: true,
  fontFamily: 'times new roman',
  fontSizes: [4, 32],
  fontStyle: 'normal',
  fontWeight: 'normal',
  padding: 1,
  rotationAngles: [-90, 90],
  scale: types.Scale.Sqrt,
  spiral: types.Spiral.Rectangular,
  transitionDuration: 600,
  renderDebounce: 100,
  batchSize: 200,
};

export interface Props {
  /**
   * Callbacks to control various word properties and behaviors.
   */
  callbacks?: types.CallbacksProp;
  /**
   * Maximum number of words to display.
   */
  maxWords?: number;
  /**
   * Set minimum [width, height] values for the SVG container.
   */
  minSize?: types.MinMaxPair;
  /**
   * Configure wordcloud with various options.
   */
  options?: types.OptionsProp;
  /**
   * Set explicit [width, height] values for the SVG container.  This will disable responsive resizing.
   */
  size?: types.MinMaxPair;
  /**
   * An array of word.  A word is an object that must contain the 'text' and 'value' keys.
   */
  words: types.Word[];
}

export default function Wordcloud({
  callbacks,
  maxWords = 100,
  minSize,
  options,
  size: initialSize,
  words,
}: Props): JSX.Element {
  const mergedCallbacks = { ...defaultCallbacks, ...callbacks };
  const mergedOptions = { ...defaultOptions, ...options };

  const [ref, selection, size] = useResponsiveSVGSelection(
    minSize,
    initialSize,
  );

  const reRender = useRef(
    debounce(
      (
        selection: types.Selection,
        mergedOptions: types.Options,
        mergedCallbacks: types.Callbacks,
        size: types.Pair<number>,
        words: types.Word[],
        maxWords: number,
      ): (() => void) => {
        const {
          deterministic,
          fontFamily,
          fontStyle,
          fontSizes,
          fontWeight,
          padding,
          rotations,
          rotationAngles,
          spiral,
          scale,
          batchSize,
        } = mergedOptions;

        const random = deterministic
          ? seedrandom('deterministic')
          : seedrandom();

        const rotateWord = rotations
          ? () => rotate(rotations, rotationAngles, random)
          : // Default rotation fn
            () => (~~(random() * 6) - 3) * 30;

        const sortedWords = words
          .concat()
          .sort((x, y) => descending(x.value, y.value))
          .slice(0, maxWords);

        const formatWords = (
          words: types.Word[],
          fontSizes: types.Pair<number>,
        ): types.Word[] => {
          const fontScale = getFontScale(words, fontSizes, scale);

          return words.map(d => {
            return {
              ...d,
              padding,
              rotate: rotateWord(),
              size: fontScale(d.value),
              font: fontFamily,
              style: fontStyle,
              weight: fontWeight,
            };
          });
        };

        let layout: CloudHandlers | undefined;

        const draw = (fontSizes: types.MinMaxPair, attempts = 1): void => {
          layout = createCloud({
            random,
            spiral,
            size,
            batchSize,
            words: formatWords(sortedWords, fontSizes),
            onDone(computedWords) {
              /** KNOWN ISSUE: https://github.com/jasondavies/d3-cloud/issues/36
               * Recursively layout and decrease font-sizes by a SHRINK_FACTOR.
               * Bail out with a warning message after MAX_LAYOUT_ATTEMPTS.
               */
              if (
                sortedWords.length !== computedWords.length &&
                attempts <= MAX_LAYOUT_ATTEMPTS
              ) {
                if (attempts === MAX_LAYOUT_ATTEMPTS) {
                  console.warn(
                    `Unable to layout ${sortedWords.length -
                      computedWords.length} word(s) after ${attempts} attempts.  Consider: (1) Increasing the container/component size. (2) Lowering the max font size. (3) Limiting the rotation angles.`,
                  );
                }
                const minFontSize = Math.max(fontSizes[0] * SHRINK_FACTOR, 1);
                const maxFontSize = Math.max(
                  fontSizes[1] * SHRINK_FACTOR,
                  minFontSize,
                );
                layout.stop();
                draw([minFontSize, maxFontSize], attempts + 1);
              } else {
                render(
                  selection,
                  computedWords,
                  mergedOptions,
                  mergedCallbacks,
                  random,
                );
              }
            },
          });
          layout.start();
        };

        draw(fontSizes);

        return () => {
          if (layout) {
            layout.stop();
          }
        };
      },
      mergedOptions.renderDebounce,
    ),
  );

  useEffect(() => {
    if (selection) {
      return reRender.current(
        selection,
        mergedOptions,
        mergedCallbacks,
        size,
        words,
        maxWords,
      );
    }
  }, [maxWords, mergedCallbacks, mergedOptions, selection, size, words]);

  return <div ref={ref} />;
}

Wordcloud.defaultProps = {
  callbacks: defaultCallbacks,
  maxWords: 100,
  minSize: [300, 300],
  options: defaultOptions,
};
