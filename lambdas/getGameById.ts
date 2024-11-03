import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, QueryCommandInput } from "@aws-sdk/lib-dynamodb";
import { TranslateClient, TranslateTextCommand } from "@aws-sdk/client-translate";

const ddbDocClient = createDocumentClient();
const translateClient = new TranslateClient({ region: process.env.REGION });

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
  try {
    console.log("Event: ", JSON.stringify(event));
    
    const pathParams = event.pathParameters;
    if (!pathParams || !pathParams.gameId) {
      return {
        statusCode: 400,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ message: "Missing gameId path parameter" }),
      };
    }
    
    const gameId = parseInt(pathParams.gameId);
    const title = event.queryStringParameters?.title;
    const translateLanguage = event.queryStringParameters?.language;
    
    let commandInput: QueryCommandInput = {
      TableName: process.env.TABLE_NAME,
      KeyConditionExpression: "id = :g",
      ExpressionAttributeValues: {
        ":g": gameId,
      },
    };

    if (title) {
      commandInput.KeyConditionExpression += " AND title = :t";
      commandInput.ExpressionAttributeValues![":t"] = title;
    }

    const commandOutput = await ddbDocClient.send(new QueryCommand(commandInput));
    const items = commandOutput.Items

    if (title && translateLanguage && items) { // If title and translateLanguage are present in the URL, and items isn't empty, continue.
      const translatedItems = await translateAllStringAttributes(items[0], translateLanguage); // Pass the item and target language into function. 
      return {
        statusCode: 200,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          data: translatedItems, // If successful return the translated item
        }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        data: items,
      }),
    };
  } catch (error: any) {
    console.error("Error:", JSON.stringify(error));
    return {
      statusCode: 500,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};

async function translateAllStringAttributes(item: any, language: string) {
  const translatedAttributes: any = {}; // Used to store new item with translated attributes

  for (const attribute in item) { // loop through each attribute
    if (typeof item[attribute] === "string") { // if the current attribute is a string, translate it.
      const command = new TranslateTextCommand({
        Text: item[attribute], // specify the attribute value to be translated
        SourceLanguageCode: "en",
        TargetLanguageCode: language,
      });
      const commandOutput = await translateClient.send(command);
      translatedAttributes[attribute] = commandOutput.TranslatedText;
    } else {
      translatedAttributes[attribute] = item[attribute]; // wasn't type string so store back as oringinal value
    }
  }
  return translatedAttributes;
}

function createDocumentClient() {
  const ddbClient = new DynamoDBClient({ region: process.env.REGION });
  const marshallOptions = {
    convertEmptyValues: true,
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  };
  const unmarshallOptions = {
    wrapNumbers: false,
  };
  const translateConfig = { marshallOptions, unmarshallOptions };
  return DynamoDBDocumentClient.from(ddbClient, translateConfig);
}
