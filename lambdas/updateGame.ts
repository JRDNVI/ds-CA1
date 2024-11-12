import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  UpdateCommandInput,
} from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDocumentClient();

export const handler: APIGatewayProxyHandlerV2 = async (event: any) => {

  const userId = event.requestContext.authorizer?.principalId

  try {
    console.log("Event: ", JSON.stringify(event));

    const body = JSON.parse(event.body || '{}');
    const title = body.title;
    const id = body.id;

    if (!title || !id) {
      return {
        statusCode: 400,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ message: "Missing title or id in request body" }),
      };
    }

    const commandOutput = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.TABLE_NAME,
        Key: { id, title }
      })
    )

    const oldBody = commandOutput.Item || {}

    if (oldBody.userId !== userId) {
      return {
        statusCode: 403,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ message: "Unauthorized: You can't update an item that you didn't add!" }),
      };
    }

    const updateCommandInput: UpdateCommandInput = { // Better
      TableName: process.env.TABLE_NAME,
      Key: { id, title },
      UpdateExpression: "SET #version = :version, #description = :description, #rating = :rating, #developer = :developer, #genre = :genre, #adult = :adult",
      ExpressionAttributeNames: {
        "#version": "version",
        "#description": "description",
        "#rating": "rating",
        "#developer": "developer",
        "#genre": "genre",
        "#adult": "adult",
      },
      ExpressionAttributeValues: {
        ":version": body.version !== undefined ? body.version : oldBody?.version,
        ":description": body.description !== undefined ? body.description : oldBody?.description,
        ":rating": body.rating !== undefined ? body.rating : oldBody?.rating,
        ":developer": body.developer !== undefined ? body.developer : oldBody?.developer,
        ":genre": body.genre !== undefined ? body.genre : oldBody?.genre,
        ":adult": body.adult !== undefined ? body.adult : oldBody?.adult,
      },
    };

    await ddbDocClient.send(new UpdateCommand(updateCommandInput));

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ message: "Game updated successfully" }),
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
