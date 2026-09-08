import _ from 'lodash';

import { mergeCustomizer } from '../src/functions/merge-customizer.function';

describe('mergeCustomizer', () => {
  test('concats arrays then uniq and sort', () => {
    expect(mergeCustomizer(['b', 'a'], ['a', 'c'])).toEqual(['a', 'b', 'c']);
  });

  test('returns undefined for non-arrays so lodash default merge runs', () => {
    expect(mergeCustomizer({ a: 1 }, { b: 2 })).toBeUndefined();
  });

  test('works as lodash mergeWith customizer', () => {
    expect(
      _.mergeWith({ arr: [2, 1] }, { arr: [1, 3] }, mergeCustomizer),
    ).toEqual({ arr: [1, 2, 3] });
  });
});
