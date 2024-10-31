import { marshall } from "@aws-sdk/util-dynamodb";
import { Game } from "./types";

export const generateGameItem = (game: Game) => {
  return {
    PutRequest: {
      Item: marshall(game),
    },
  };
};

export const generateGameBatch = (data: Game[]) => {
  return data.map((e) => {
    return generateGameItem(e);
  });
};
