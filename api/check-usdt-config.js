export default function handler(req, res) {
  const address = process.env.USDT_TRC20_DEPOSIT_ADDRESS;

  res.status(200).json({
    configured: Boolean(address),
    network: "TRC20"
  });
}export default function handler(req, res) {
  const address = process.env.USDT_TRC20_DEPOSIT_ADDRESS;

  res.status(200).json({
    configured: Boolean(address),
    network: "TRC20"
  });
}