const fs = require('fs');
const csv = require('csv-parser');

const INPUT_FILE = 'input.csv';
const OUTPUT_FILE = 'airdrop_list.json';
const TOKENS_PER_NFT = 4;

const TARGET_WALLET = '0xc8f8e2f59dd95ff67c3d39109eca2e2a017d4c8a'.toLowerCase();

async function parseTransfers() {
  const transfers = [];

  return new Promise((resolve, reject) => {
    if (!fs.existsSync(INPUT_FILE)) {
      console.error(`Error: ${INPUT_FILE} not found. Please place your Etherscan CSV in this directory and name it ${INPUT_FILE}.`);
      process.exit(1);
    }

    fs.createReadStream(INPUT_FILE)
      .pipe(csv())
      .on('data', (row) => {
        const getVal = (names) => {
          const key = Object.keys(row).find(k => 
            names.includes(k.trim()) || 
            names.includes(k.trim().toLowerCase())
          );
          return key ? row[key] : null;
        };

        const from = getVal(['From', 'from']);
        const to = getVal(['To', 'to']);
        const hash = getVal(['Transaction Hash', 'Txhash', 'txhash']);
        const block = getVal(['Blockno', 'blockno']);
        const timestamp = getVal(['UnixTimestamp', 'unixtimestamp']);
        const value = getVal(['Value', 'value', 'Quantity', 'quantity']);

        if (!to || to.toLowerCase() !== TARGET_WALLET) return;
        if (!from || !hash) return;

        transfers.push({
          hash: hash,
          block: parseInt(block) || 0,
          timestamp: parseInt(timestamp) || 0,
          from: from.toLowerCase(),
          value: parseInt(value.replace(/,/g, '')) || 0
        });
      })
      .on('end', () => {
        transfers.sort((a, b) => {
          if (a.block !== b.block) return a.block - b.block;
          if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
          return a.hash.localeCompare(b.hash);
        });

        console.log(`Parsed ${transfers.length} qualifying transfers to ${TARGET_WALLET}.`);

        const userCounts = {};
        const airdropQueue = [];
        let totalDistributed = 0;

        for (const transfer of transfers) {
          const user = transfer.from;
          const amount = transfer.value;
          
          for (let i = 0; i < amount; i++) {
            userCounts[user] = (userCounts[user] || 0) + 1;

            if (userCounts[user] % TOKENS_PER_NFT === 0) {
              totalDistributed++;
              airdropQueue.push({
                address: user,
                nftId: totalDistributed,
                earnedFrom: `After sending ${userCounts[user]} NFTs (last Tx: ${transfer.hash})`
              });
            }
          }
        }

        console.log(`Generated airdrop list for ${airdropQueue.length} new NFTs.`);

        // 3. Save to JSON
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(airdropQueue, null, 2));
        console.log(`Airdrop list saved to ${OUTPUT_FILE}`);
        resolve(airdropQueue);
      })
      .on('error', reject);
  });
}

parseTransfers();

