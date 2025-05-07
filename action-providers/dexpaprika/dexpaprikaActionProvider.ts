import { ActionProvider, Network, WalletProvider, CreateAction } from "@tokenomiapro/agentkit";
import { searchSchema } from "./schemas";
import { z } from "zod";

export class DexpaprikaActionProvider extends ActionProvider<WalletProvider> {
  constructor() {
    super("dexpaprika", []);
  }

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

  supportsNetwork(network: Network): boolean {
    return true;
  }
}

export const dexpaprikaActionProvider = () => new DexpaprikaActionProvider();
