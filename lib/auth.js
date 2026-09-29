// アプリ用パスワードの確認（環境変数 APP_PASSWORD と照合）
export function checkPassword(req, res) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    res.status(500).json({ error: 'サーバーにAPP_PASSWORDが設定されていません。デプロイナウの環境変数を確認してください。' });
    return false;
  }
  const given = (req.body && req.body.password) || '';
  if (given !== expected) {
    res.status(401).json({ error: 'パスワードが違います。' });
    return false;
  }
  return true;
}
