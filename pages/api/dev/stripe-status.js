import { getStripeStatus } from '../../../lib/server/stripeHealth';

export default function handler(req, res) {
  if (process.env.NODE_ENV !== 'development') return res.status(404).end();
  res.json(getStripeStatus());
}
