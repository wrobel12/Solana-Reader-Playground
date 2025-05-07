import { ActionProvider, Network, WalletProvider, CreateAction } from "@tokenomiapro/agentkit";
import { searchSchema, tokenDetailsSchema } from "./schemas";
import { z } from "zod";

export class DexpaprikaActionProvider extends ActionProvider<WalletProvider> {
  constructor() {
    super("dexpaprika", []);
  }

  //general search action
  @CreateAction({
    name: "search",
    description:
      "Allows users to search across multiple entities (tokens, pools, and DEXes) in a single query. Useful for quickly finding resources by name, symbol, or ID.",
    schema: searchSchema,
  })
  async search(args: z.infer<typeof searchSchema>): Promise<string> {
    const response = await fetch(`https://api.dexpaprika.com/search/?query=${args.query}`);
    return response.json();
  }

  @CreateAction({
    name: "get_token_data",
    description:
      "Retrieves detailed information about a specific token on the given network, including latest price, metadata, status, and recent summary metrics such as price changes and volumes over multiple timeframes.",
    schema: tokenDetailsSchema,
  })
  async getTokenData(args: z.infer<typeof tokenDetailsSchema>): Promise<string> {
    const response = await fetch(
      `https://api.dexpaprika.com/networks/${args.network}/tokens/${args.tokenAddress}`,
    );
    return response.json();
  }

  supportsNetwork(network: Network): boolean {
    return true;
  }
}

export const dexpaprikaActionProvider = () => new DexpaprikaActionProvider();
