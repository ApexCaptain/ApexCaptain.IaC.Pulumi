import _ from 'lodash';

export const mergeCustomizer = (value: unknown, srcValue: unknown) => {
  if (_.isArray(value)) {
    return _.sortBy(_.uniq(value.concat(srcValue)));
  }
  return undefined;
};
