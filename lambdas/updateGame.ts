import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  UpdateCommandInput,
} from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDocumentClient();

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    console.log("Event: ", JSON.stringify(event));

    const body = JSON.parse(event.body || '{}');
    const title = body.title;
    const id = body.id;

    if (!title) {
      return {
        statusCode: 400,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ message: "Missing title in request body" }),
      };
    }

    const updateCommandInput: UpdateCommandInput = {
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
        ":version": body.version,
        ":description": body.description,
        ":rating": body.rating,
        ":developer": body.developer,
        ":genre": body.genre,
        ":adult": body.adult,
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
