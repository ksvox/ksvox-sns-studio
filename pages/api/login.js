import { checkPassword } from '../../lib/auth';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!checkPassword(req, res)) return;
  res.status(200).json({ ok: true });
}
