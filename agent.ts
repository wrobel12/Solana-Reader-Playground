import {
  AgentKit,
  SOLANA_NETWORK_ID,
  SolanaKeypairWalletProvider,
  splActionProvider,
  walletActionProvider,
  alloraActionProvider,
  jupiterActionProvider,
} from "@tokenomiapro/agentkit";
import { getLangChainTools } from "@tokenomiapro/agentkit-langchain";
import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { Keypair } from "@solana/web3.js";
import * as dotenv from "dotenv";
import * as readline from "readline";
import * as fs from "fs";
import bs58 from "bs58";
import { dexpaprikaActionProvider } from "./action-providers/dexpaprika";

dotenv.config();

/**
 * Validates that required environment variables are set
 *
 * @throws {Error} - If required environment variables are missing
 * @returns {void}
 */
function validateEnvironment(): void {
  const missingVars: string[] = [];

  // Check required variables
  const requiredVars = ["OPENAI_API_KEY"];
  requiredVars.forEach(varName => {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  });

  // Exit if any required variables are missing
  if (missingVars.length > 0) {
    console.error("Error: Required environment variables are not set");
    missingVars.forEach(varName => {
      console.error(`${varName}=your_${varName.toLowerCase()}_here`);
    });
    process.exit(1);
  }

  // Warn about optional SOLANA_RPC_URL & NETWORK_ID
  if (!process.env.SOLANA_RPC_URL && !process.env.NETWORK_ID) {
    console.warn(
      "Warning: SOLANA_RPC_URL and NETWORK_ID both are unset, defaulting to solana-devnet",
    );
  }
}

// Add this right after imports and before any other code
validateEnvironment();

const generalSystemMessage = `
        You are a helpful agent that can interact onchain on Solana using the Coinbase Developer Platform AgentKit. You are 
        empowered to interact onchain using your tools. If you ever need funds, you can request them from the 
        faucet if you are on network ID 'solana-devnet'. If not, you can provide your wallet details and request 
        funds from the user. Before executing your first action, get the wallet details to see what network 
        you're on. If there is a 5XX (internal) HTTP error code, ask the user to try again later. If someone 
        asks you to do something you can't do with your currently available tools, you must say so, and 
        encourage them to implement it themselves using the CDP SDK + Agentkit, recommend they go to 
        docs.cdp.coinbase.com for more information. Be concise and helpful with your responses. Refrain from 
        restating your tools' descriptions unless it is explicitly requested.
        `;
const investorSystemMessage = `You are a blockchain-integrated autonomous AI agent running in an infinite loop. Your task is to analyze price predictions and market data, and prepare prompts for trades on Solana if profitable conditions are met.

        On each loop iteration, follow these steps:
        1. Fetch the 8h predicted price for SOL from the Allora Network.
        2. Fetch the current average SOL price from Dexpaprika (DEX aggregator) using get_token_details methond on Solana network.
        3. Compare the two:
          - If predicted price > average market price, return prompt to swap exactly **1 USDC (token address: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)** to **SOL** using Jupiter Aggregator on Solana.
        DO NOT EXECUTE SWAP!
        `;

/**
 * Initialize the agent with CDP Agentkit
 *
 * @returns Agent executor and config
 */
async function initializeAgent(systemMessage: any) {
  try {
    // Initialize LLM
    const llm = new ChatOpenAI({
      model: "gpt-4o-mini",
      temperature: 0, // make it less annoying
    });

    // Initialize Wallet Provider

    let solanaPrivateKey = process.env.SOLANA_PRIVATE_KEY as string;
    if (!solanaPrivateKey) {
      console.log("No Solana account detected. Generating keys...");
      const keypair = Keypair.generate();
      solanaPrivateKey = bs58.encode(keypair.secretKey);
      fs.appendFileSync(".env", `SOLANA_PRIVATE_KEY=${solanaPrivateKey}\n`);
      console.log(`Created Solana Wallet: ${keypair.publicKey.toBase58()}`);
    }

    let walletProvider: SolanaKeypairWalletProvider;
    const rpcUrl = process.env.SOLANA_RPC_URL;

    if (rpcUrl) {
      walletProvider = await SolanaKeypairWalletProvider.fromRpcUrl(rpcUrl, solanaPrivateKey);
    } else {
      const network = (process.env.NETWORK_ID ?? "solana-devnet") as SOLANA_NETWORK_ID;
      walletProvider = await SolanaKeypairWalletProvider.fromNetwork(network, solanaPrivateKey);
    }

    // Initialize AgentKit
    const agentkit = await AgentKit.from({
      walletProvider,
      actionProviders: [
        walletActionProvider(),
        dexpaprikaActionProvider(),
        splActionProvider(),
        jupiterActionProvider(),
        alloraActionProvider(),
      ],
    });

    const tools = await getLangChainTools(agentkit);

    // Store buffered conversation history in memory and track session start time
    const memory = new MemorySaver();
    const startTimestamp = new Date().toISOString();
    console.log(startTimestamp);
    const agentConfig = { configurable: { thread_id: startTimestamp } };

    // Create React Agent using the LLM and Solana AgentKit tools
    const agent = createReactAgent({
      llm,
      tools,
      checkpointSaver: memory,
      messageModifier: systemMessage,
    });

    return { agent, config: agentConfig };
  } catch (error) {
    console.error("Failed to initialize agent:", error);
    throw error; // Re-throw to be handled by caller
  }
}

/**
 * Run the agent autonomously with specified intervals
 *
 * @param agent - The agent executor
 * @param config - Agent configuration
 * @param interval - Time interval between actions in seconds
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runAutonomousMode(agent: any, config: any, interval = 10) {
  console.log("Starting autonomous mode...");

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const thought =
        "Be creative and do something interesting on the blockchain. " +
        "Choose an action or set of actions and execute it that highlights your abilities.";

      const stream = await agent.stream({ messages: [new HumanMessage(thought)] }, config);

      for await (const chunk of stream) {
        if ("agent" in chunk) {
          console.log(chunk.agent.messages[0].content);
        } else if ("tools" in chunk) {
          console.log(chunk.tools.messages[0].content);
        }
        console.log("-------------------");
      }

      await new Promise(resolve => setTimeout(resolve, interval * 1000));
    } catch (error) {
      if (error instanceof Error) {
        console.error("Error:", error.message);
      }
      process.exit(1);
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runAutonomousInvestorMode(agent: any, config: any, interval = 60) {
  console.log("Starting autonomous investor mode...");
  console.log(config.messageModifier);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const thought =
        "Begin loop. Start by fetching 8h SOL price prediction from Allora and comparing it to the average DEX price using Dexpaprika. If prediction is higher, prepare a prompt for a swap of 1 USDC to SOL using Jupiter. Then wait 60 seconds and repeat.";

      const stream = await agent.stream({ messages: [new HumanMessage(thought)] }, config);

      for await (const chunk of stream) {
        if ("agent" in chunk) {
          console.log(chunk.agent.messages[0].content);
        } else if ("tools" in chunk) {
          console.log(chunk.tools.messages[0].content);
        }
        console.log("-------------------");
      }

      await new Promise(resolve => setTimeout(resolve, interval * 1000));
    } catch (error) {
      if (error instanceof Error) {
        console.error("Error:", error.message);
      }
      process.exit(1);
    }
  }
}

/**
 * Run the agent interactively based on user input
 *
 * @param agent - The agent executor
 * @param config - Agent configuration
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runChatMode(agent: any, config: any) {
  console.log("Starting chat mode... Type 'exit' to end.");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise(resolve => rl.question(prompt, resolve));

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const userInput = await question("\nPrompt: ");

      if (userInput.toLowerCase() === "exit") {
        break;
      }

      const stream = await agent.stream({ messages: [new HumanMessage(userInput)] }, config);

      for await (const chunk of stream) {
        if ("agent" in chunk) {
          console.log(chunk.agent.messages[0].content);
        } else if ("tools" in chunk) {
          console.log(chunk.tools.messages[0].content);
        }
        console.log("-------------------");
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error:", error.message);
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}

/**
 * Choose whether to run in autonomous, chat or investor mode based on user input
 *
 * @returns Selected mode
 */
async function chooseMode(): Promise<"chat" | "auto" | "investor"> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise(resolve => rl.question(prompt, resolve));

  // eslint-disable-next-line no-constant-condition
  while (true) {
    console.log("\nAvailable modes:");
    console.log("1. chat    - Interactive chat mode");
    console.log("2. auto    - Autonomous action mode");
    console.log("3. investor    - Autonomous investor mode");

    const choice = (await question("\nChoose a mode (enter number or name): "))
      .toLowerCase()
      .trim();

    if (choice === "1" || choice === "chat") {
      rl.close();
      return "chat";
    } else if (choice === "2" || choice === "auto") {
      rl.close();
      return "auto";
    } else if (choice === "3" || choice === "investor") {
      rl.close();
      return "investor";
    }
    console.log("Invalid choice. Please try again.");
  }
}

const modeConfig = {
  chat: {
    systemMessage: generalSystemMessage,
    run: runChatMode,
  },
  auto: {
    systemMessage: generalSystemMessage,
    run: runAutonomousMode,
  },
  investor: {
    systemMessage: investorSystemMessage,
    run: runAutonomousInvestorMode,
  },
};

/**
 * Start the chatbot agent
 */
async function main() {
  try {
    //const { agent, config } = await initializeAgent();
    const mode = await chooseMode();

    const configForMode = modeConfig[mode];
    if (!configForMode) {
      throw new Error(`Unknown mode: ${mode}`);
    }

    const { agent, config } = await initializeAgent(configForMode.systemMessage);
    await configForMode.run(agent, config);
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error:", error.message);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  console.log("Starting Agent...");
  main().catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
