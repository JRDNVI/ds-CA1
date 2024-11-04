import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, QueryCommandInput, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { TranslateClient, TranslateTextCommand } from "@aws-sdk/client-translate";
import Ajv from "ajv";
import schema from "../shared/types.schema.json";

const ajv = new Ajv();
const isValidQueryParams = ajv.compile(
  schema.definitions["GameQueryParams"] || {}
);

const ddbDocClient = createDocumentClient();
const translateClient = new TranslateClient({ region: process.env.REGION });

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
  try {
    console.log("Event: ", JSON.stringify(event));
    
    const pathParams = event?.pathParameters;
    const gameId = pathParams?.gameId ? parseInt(pathParams.gameId) : undefined;

    if (!gameId) {
      return {
        statusCode: 400,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ message: "Missing game Id " }),
      };
    }

    const queryParams = event?.queryStringParameters || {}

    if (!isValidQueryParams(queryParams)) {
      return {
        statusCode: 500,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message: `Incorrect type. Must match Query parameters schema`,
          schema: schema.definitions["GameQueryParams"],
        }),
      };
    }
    
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
      console.log("Checking for existing translation in TranslationTable...");
      
      const translationCheckResult = await ddbDocClient.send( // Check to see if a translation for an item is already in the translation table.
        new GetCommand({ 
          TableName: process.env.LANG_TABLE_NAME,
          Key: {
            id: gameId,
            title: title 
          }
        }));

      if (translationCheckResult.Item) { // if translationCheckResult.Item is not empty, return the translated item
        console.log("Found existing translation:", translationCheckResult.Item);
        return {
          statusCode: 200,
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            data: translationCheckResult.Item,
          }),
        };
      }
      
      console.log("No existing translation found");

      const translatedItems = await translateAllStringAttributes(items[0], translateLanguage); // Pass the item and target language into function. 
      console.log("Storing new translation in TranslationTable...");
      await ddbDocClient.send(
        new PutCommand({
          TableName: process.env.LANG_TABLE_NAME,
          Item: translatedItems
      })
    );

      return {
        statusCode: 200,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          data: translatedItems,
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
    if (typeof item[attribute] === "string") { // if the current attribute value is a string, translate it.
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
