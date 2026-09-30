import { compose } from '../core/compose';
import { netTransport } from './transport';
import { netProtocol } from './protocol';

/* Net is composed from per-concern parts; methods share state through `this`. */
export const Net = compose(
  netTransport,
  netProtocol
);