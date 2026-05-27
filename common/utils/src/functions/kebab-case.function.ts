import _ from 'lodash';

const wordsToPreserve = ['k8s'].map(eachWord => ({
  expected: eachWord.toLowerCase(),
  kebabCase: _.kebabCase(eachWord),
}));

export function kebabCase(value: string): string {
  let result = _.kebabCase(value);
  wordsToPreserve.forEach(eachWord => {
    result = result.replace(eachWord.kebabCase, eachWord.expected);
  });
  return result;
}
