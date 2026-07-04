/**
 * Vault bootstrap token (v1) — re-exports
 *
 * IaC 진입점은 {@link BootstrapTokenV1} (`resources/vault`)를 사용합니다.
 */
export {
  decrypt,
  encrypt,
  resolveBootstrapTokenV1,
  type ResolveBootstrapTokenV1Args,
  type ResolveBootstrapTokenV1Result,
} from './bootstrap-token.logic';

/** @deprecated BootstrapTokenV1 Command 리소스를 사용하세요 */
export type GetBootstrapTokenV1Args = import('./bootstrap-token.logic').ResolveBootstrapTokenV1Args;
