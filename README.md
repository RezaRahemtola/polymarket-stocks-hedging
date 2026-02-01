# Polymarket Stocks Hedging

Automatically find & invest in stocks hedging opportunities with Polymarket.\
It allows you to buy NO shares on stock price prediction, effectively acting as an hedge against shares you might own in these companies.\

Due to the inefficiencies of prediction markets (especially in these markets that have little liquidity), yields can be very attractive compared to stocks (20%+ APY on pretty safe scenarios is common, while the downside is minimal if you actually own shares of the companies you bet on).

## Features

- **Market Scanner**: Scans Polymarket for stock price prediction markets and identifies opportunities based on several factors (delta from current price, time left, APY...)
- **Portfolio Dashboard**: View positions, available balance, and portfolio breakdown pie chart
- **Trade Execution**: Execute trades directly with configurable max price and amount
- **Position Redemption**: Automatically redeems resolved winning positions

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create `.env` file:

```bash
POLYGON_PRIVATE_KEY=your_wallet_private_key
POLYMARKET_FUNDER_ADDRESS=your_polymarket_proxy_wallet_address
POLYGON_RPC_URL=https://polygon-rpc.com  # or your preferred RPC
```

### 3. Configure scanner

Edit `config/config.json`:

```json
{
  "stocks": ["GOOGL", "AMZN"],
  "opportunities": {
    "minAPY": 25,
    "minDisplayAPY": 8,
    "minDeltaPercent": 7
  },
  "scanner": {
    "intervalMinutes": 5
  }
}
```

| Field             | Description                                            |
| ----------------- | ------------------------------------------------------ |
| `stocks`          | Stock tickers to scan for                              |
| `minAPY`          | Minimum APY to flag as "opportunity" (green highlight) |
| `minDisplayAPY`   | APY cutoff - hide opportunities below this             |
| `minDeltaPercent` | Minimum delta % from current stock price               |
| `intervalMinutes` | Auto-scan interval in production                       |

### 4. Run development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Usage

### Dashboard

- **Positions**: Total value of open positions with count
- **Available**: USDC balance available for trading
- **Opportunities**: Count of opportunities meeting minAPY threshold

### Opportunities Table

Click column headers to sort. Columns:

| Column   | Description                           |
| -------- | ------------------------------------- |
| Market   | Event title with link to Polymarket   |
| Strike   | Strike price of the bracket           |
| Delta    | % difference from current stock price |
| NO Price | Current best ask price for NO shares  |
| APY      | Annualized yield if NO wins           |
| Score    | Opportunity score (0-100)             |
| Expires  | Days until market resolution          |

### Trading

1. Click **Trade** on an opportunity
2. Adjust **Max Price** (highest price you'll pay)
3. Adjust **Max Amount** (budget limit)
4. Review shares, cost, APY, and profit preview
5. Click **Execute**

### Skipping

Click **Skip** to hide an opportunity:
- **Snooze (24h)**: Reappears after 24 hours
- **Dismiss Forever**: Permanently hidden

## Scoring Formula

```
Score = APY Score (30 pts max) + Delta Score (70 pts max)

APY Score = min(APY, 200) / 200 * 30
Delta Score = min(|delta|, 50) / 50 * 70
```

Higher delta = safer bet (stock less likely to reach strike price).

## Architecture

```
├── app/
│   ├── api/
│   │   ├── approve/      # Execute trades
│   │   ├── opportunities/# Get cached opportunities
│   │   ├── orderbook/    # Get orderbook + preview
│   │   ├── portfolio/    # Get positions + balance
│   │   ├── reject/       # Skip opportunities
│   │   └── scan/         # Trigger market scan
│   └── page.tsx          # Main dashboard
├── components/
│   ├── ApproveModal.tsx  # Trade execution modal
│   ├── PositionsPieChart.tsx
│   └── RejectModal.tsx
├── lib/
│   ├── config.ts         # Configuration loader
│   ├── persistence.ts    # File-based storage
│   ├── position-redeemer.ts # Auto-redeem positions
│   ├── scanner.ts        # Market scanner
│   └── trade-client.ts   # Polymarket CLOB client
└── config/
    └── config.json       # Scanner configuration
```

## Production

```bash
npm run build
npm start
```

In production, the scanner runs automatically on the configured interval and redeems resolved positions.
