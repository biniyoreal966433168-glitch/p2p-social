module.exports = (req, res) => {
  const address = process.env.USDT_TRC20_DEPOSIT_ADDRESS;

  res.status(200).json({
    configured: !!address,
    network: "TRC20"
  });
};