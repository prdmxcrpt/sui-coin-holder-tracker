import fs from 'fs';
import path from 'path';
import { generateReport, isValidCoinType, HoldersReport } from './tracker.js';

async function main() {
  const args = process.argv.slice(2);
  const coinTypeArg = args[0] || '0x8130994ef5299d244dbf18cf1e134c3aea2ab517ee37c351a40cd9ed33bc59ca::chillbull::CHILLBULL';

  console.log(`🛡️  Sentinel Sui Coin Holder Tracker`);
  console.log(`========================================`);
  console.log(`Target Coin Type: ${coinTypeArg}\n`);

  if (!isValidCoinType(coinTypeArg)) {
    console.error(`❌ Security/Validation Error: Invalid Sui Coin Type format.`);
    console.error(`Expected format: 0x<packageId>::<moduleName>::<coinSymbol>`);
    process.exit(1);
  }

  try {
    console.log(`🔍 Fetching holder list and performing wallet deep-dive...`);
    const report: HoldersReport = await generateReport(coinTypeArg, { maxHolders: 20 });

    const outputPath = path.resolve(process.cwd(), 'holders_report.json');
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');

    console.log(`\n✅ Report successfully generated!`);
    console.log(`📁 Report written to: ${outputPath}\n`);

    // Terminal Summary
    console.log(`📊 SUMMARY METRICS`);
    console.log(`----------------------------------------`);
    console.log(`Coin Name:        ${report.coinMetadata?.name || 'N/A'}`);
    console.log(`Coin Symbol:      ${report.coinMetadata?.symbol || 'N/A'}`);
    console.log(`Decimals:         ${report.coinMetadata?.decimals ?? 'N/A'}`);
    console.log(`Total Holders:    ${report.totalHoldersFound}`);
    console.log(`Report Generated: ${report.timestamp}`);
    console.log(`----------------------------------------\n`);

    console.log(`👥 TOP HOLDER ADDRESSES & DEEP DIVE SAMPLE:`);
    report.holders.slice(0, 5).forEach((holder, idx) => {
      console.log(`\n[Holder #${idx + 1}] Address: ${holder.address}`);
      console.log(`  └ Target Coin Balance: ${holder.targetCoinBalance}`);
      console.log(`  └ Other Coins Held:    ${holder.otherCoinBalances.length} distinct coins`);
      console.log(`  └ Recent Transfers:   ${holder.transferHistory.length} txs found`);
      if (holder.otherCoinBalances.length > 0) {
        const topOther = holder.otherCoinBalances.slice(0, 3).map(c => `${c.symbol}: ${c.totalBalance}`).join(', ');
        console.log(`  └ Other Coin Samples: ${topOther}`);
      }
    });

  } catch (error: any) {
    console.error(`\n❌ Error generating report: ${error?.message || 'An error occurred'}`);
    process.exit(1);
  }
}

main();
