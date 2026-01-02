const { ethers } = require('ethers');
const fs = require('fs');

// --- CONFIGURATION ---
const RPC_URL = 'YOUR_RPC_URL'; // e.g. Alchemy or Infura
const PRIVATE_KEY = 'YOUR_PRIVATE_KEY'; // MUST be the owner/minter address
const CONTRACT_ADDRESS = 'NEW_NFT_CONTRACT_ADDRESS';
const AIRDROP_FILE = 'airdrop_list.json';

// Simple ERC-721 ABI for minting (adjust if your function name is different)
const ABI = [
  "function mint(address to, uint256 tokenId) public",
  "function safeMint(address to, uint256 tokenId) public",
  "function ownerOf(uint256 tokenId) public view returns (address)"
];

async function runAirdrop() {
  if (!fs.existsSync(AIRDROP_FILE)) {
    console.error(`Error: ${AIRDROP_FILE} not found. Run node parser.js first.`);
    process.exit(1);
  }

  const airdropList = JSON.parse(fs.readFileSync(AIRDROP_FILE, 'utf8'));
  console.log(`Starting airdrop for ${airdropList.length} NFTs...`);

  // Setup provider and wallet
  if (RPC_URL === 'YOUR_RPC_URL' || PRIVATE_KEY === 'YOUR_PRIVATE_KEY') {
    console.log('\n--- TEMPLATE MODE ---');
    console.log('Please edit airdrop.js and fill in RPC_URL and PRIVATE_KEY.');
    console.log('Here is what the execution would look like:');
    airdropList.slice(0, 3).forEach(item => {
      console.log(`- Minting NFT #${item.nftId} to ${item.address}`);
    });
    if (airdropList.length > 3) console.log(`- ... and ${airdropList.length - 3} more.`);
    return;
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

  for (const item of airdropList) {
    try {
      console.log(`Minting NFT #${item.nftId} to ${item.address}...`);
      
      // Use mint or safeMint depending on your contract
      const tx = await contract.safeMint(item.address, item.nftId);
      console.log(`  Tx Sent: ${tx.hash}`);
      
      await tx.wait();
      console.log(`  Confirmed!`);
      
    } catch (error) {
      console.error(`  Failed to mint to ${item.address}:`, error.message);
      // You might want to log failed ones to a separate file
    }
  }

  console.log('Airdrop complete!');
}

runAirdrop();

