# Polymarket Stocks Hedging

<img width="2974" height="2114" alt="image" src="https://github.com/user-attachments/assets/ae976126-0a1d-450f-8dde-376598d1f733" />

## What is this?

[Polymarket](https://polymarket.com) offers prediction markets on stock prices, such as "Will GOOGL close above $200 by end of February?". These markets let you bet YES or NO on outcomes.

### The opportunity

By buying NO shares on price targets significantly above the current stock price, you're essentially betting the stock won't reach that price. If you're right, you get $1 per share at expiration. If you're wrong but own the actual stock, your stock gains offset the prediction market loss.

### Why it works

Prediction markets, especially low-liquidity ones, are often inefficient. You can frequently find 20-50%+ APY on relatively safe scenarios (e.g., betting a stock won't rise 30% in 2 weeks).

### Example

GOOGL is at $180. A market asks "Will GOOGL hit $250 by March?". NO shares cost $0.92. If GOOGL stays below $250, you profit $0.08/share (8.7% in a few weeks = high APY). If GOOGL somehow hits $250, you lose $0.92/share but your GOOGL stock gained ~39%.

This tool scans Polymarket for these opportunities, ranks them by attractiveness, and optionally lets you execute trades directly.

## Features

- **Market Scanner**: Scans Polymarket for stock price prediction markets and identifies opportunities based on delta from current price, time to expiry, and APY
- **Portfolio Dashboard**: View positions, available balance, and portfolio breakdown
- **Trade Execution**: Execute trades directly with configurable max price and amount (optional - requires wallet setup)
- **Position Redemption**: Automatically redeems resolved winning positions

## Quick Start (View Only)

You can run the scanner without any wallet configuration to just discover opportunities.

### 1. Install dependencies

```bash
npm install
```

### 2. Configure scanner

Edit `config/config.json`:

```json
{
  "stocks": ["GOOGL", "AMZN"],
  "opportunities": {
    "opportunityAPY": 25,
    "minDisplayAPY": 8,
    "minDeltaPercent": 7
  }
}
```

| Field             | Description                                            |
| ----------------- | ------------------------------------------------------ |
| `stocks`          | Stock tickers to scan for                              |
| `opportunityAPY`  | Minimum APY to flag as "opportunity" (green highlight) |
| `minDisplayAPY`   | APY cutoff - hide opportunities below this             |
| `minDeltaPercent` | Delta (% from current stock price) cutoff              |

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Trading Setup (Optional)

To execute trades, you need to configure your Polymarket wallet.

### 1. Create `.env` file

```bash
# Wallet credentials (required for trading)
POLYGON_PRIVATE_KEY=your_wallet_private_key
POLYMARKET_FUNDER_ADDRESS=your_polymarket_proxy_wallet_address
POLYGON_RPC_URL=https://polygon-rpc.com

# Auth password for trading
TRADE_PASSWORD=your_secure_password
```

> **Finding your Polymarket proxy address**: This is the address Polymarket uses to hold your funds. You can find it in your Polymarket account settings or by checking the deposit address.

### 2. Login to trade

Click **Login** in the app header and enter your `TRADE_PASSWORD` to enable trading.

## Usage

### Dashboard

- **Positions**: Total value of open positions with count
- **Balance**: USDC balance available for trading
- **Opportunities**: Count of opportunities meeting the `opportunityAPY` threshold

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

## Production Deployment

### Using Docker

```bash
docker compose up -d --build
```

The app runs on port 50003 by default.

### VPN Setup (Optional)

Required to place orders if your server is in a country where Polymarket is restricted (e.g., France).\
If you don't need it, remove the vpn service from the `docker-compose.yml` file & the references to it in the app service.

#### Step 1: Get OpenVPN Configuration

Using Proton VPN as an example (works with other providers too):

1. Log in to [Proton VPN Dashboard](https://account.protonvpn.com/)
2. Navigate to **Downloads** > **OpenVPN configuration files**
3. Select:
   - **Platform**: Linux
   - **Protocol**: UDP (recommended) or TCP
   - **Connection**: Choose a specific server (e.g., Ireland)
4. Download the `.ovpn` file
5. Get your **OpenVPN Credentials** from Account section (different from login password)

#### Step 2: Prepare VPN Files

```bash
mkdir -p vpn
mv ~/Downloads/your-server.ovpn vpn/vpn.ovpn
```

#### Step 3: Create Authentication File

Create `vpn/vpn.auth` with your OpenVPN credentials:

```
your-openvpn-username
your-openvpn-password
```

> One credential per line (username on line 1, password on line 2).

#### Step 4: Edit VPN Configuration

Open `vpn/vpn.ovpn` and:

1. Find `auth-user-pass` and change it to:

   ```
   auth-user-pass /vpn/vpn.auth
   ```

2. Comment out `update-resolv-conf` references if present:
   ```
   # script-security 2
   # up /etc/openvpn/update-resolv-conf
   # down /etc/openvpn/update-resolv-conf
   ```

#### Step 5: Deploy

The `docker-compose.yml` includes VPN configuration. Just run:

```bash
docker compose up -d
```

The app traffic will route through the VPN while the port remains accessible on your host.

<div align="center">
  <h2>Made with ❤️ by</h2>
  <a href="https://github.com/RezaRahemtola">
    <img src="https://github.com/RezaRahemtola.png?size=85" width=85/>
    <br>
    <span>Reza Rahemtola</span>
  </a>
</div>
