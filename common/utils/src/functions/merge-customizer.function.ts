import _ from 'lodash';

export function mergeCustomizer(value: unknown, srcValue: unknown): unknown {
  if (_.isArray(value)) {
    return _.sortBy(_.uniq(value.concat(srcValue)));
  }
  return undefined;
}
