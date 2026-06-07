export class VsCodeObject<ObjectType extends Object> {
  static isVscodeObject(target: any): target is VsCodeObject<any> {
    return (
      typeof target == 'object' &&
      '__projen_aux_object_key' in target &&
      (target as VsCodeObject<any>).__projen_aux_object_key ==
        VsCodeObject.__projen_aux_object_key
    );
  }
  private static __projen_aux_object_key = '__PROJEN_AUX_OBJECT_KEY' as const;
  private __projen_aux_object_key = VsCodeObject.__projen_aux_object_key;
  constructor(readonly object: ObjectType) {}
}
