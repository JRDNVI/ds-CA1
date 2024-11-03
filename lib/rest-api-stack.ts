import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as custom from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import * as apig from "aws-cdk-lib/aws-apigateway";
import { generateGameBatch } from "../shared/util";
import { games } from "../seed/games";
import * as iam from "aws-cdk-lib/aws-iam";

export class RestAPIStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const gamesTable = new dynamodb.Table(this, "GameTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "id", type: dynamodb.AttributeType.NUMBER },
      sortKey: { name: "title", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "Games",
    });

    const TranslationTable = new dynamodb.Table(this, "TranslationTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "id", type: dynamodb.AttributeType.NUMBER },
      sortKey: { name: "title", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "TranslationTable",
    });


    new custom.AwsCustomResource(this, "gamesddbInitData", {
      onCreate: {
        service: "DynamoDB",
        action: "batchWriteItem",
        parameters: {
          RequestItems: {
            [gamesTable.tableName]: generateGameBatch(games),
          },
        },
        physicalResourceId: custom.PhysicalResourceId.of("gamesddbInitData"),
      },
      policy: custom.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [gamesTable.tableArn],
      }),
    });

    const translatePolicy = new iam.PolicyStatement({ // Create policy statement that allows my AWS account access to AWSTranslate
      actions: ["translate:TranslateText"],
      resources: ["*"]
    });

    const getGameByIdFn = new lambdanode.NodejsFunction(
      this,
      "GetGameByIdFn",
      {
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: `${__dirname}/../lambdas/getGameById.ts`,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        environment: {
          TABLE_NAME: gamesTable.tableName,
          LANG_TABLE_NAME: TranslationTable.tableName,
          REGION: 'eu-west-1',
        },
      }
      );

      const newGameFn = new lambdanode.NodejsFunction(this, "AddGameFn", {
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_16_X,
        entry: `${__dirname}/../lambdas/addGame.ts`,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        environment: {
          TABLE_NAME: gamesTable.tableName,
          REGION: "eu-west-1",
        },
      });

      const updateGameFn = new lambdanode.NodejsFunction(this, "updateGameFn", {
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_16_X,
        entry: `${__dirname}/../lambdas/updateGame.ts`,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        environment: {
          TABLE_NAME: gamesTable.tableName,
          REGION: "eu-west-1",
        },
      });


        
        const api = new apig.RestApi(this, "RestAPI", {
          description: "demo api",
          deployOptions: {
            stageName: "dev",
          },
          defaultCorsPreflightOptions: {
            allowHeaders: ["Content-Type", "X-Amz-Date"],
            allowMethods: ["OPTIONS", "GET", "POST", "PUT", "PATCH", "DELETE"],
            allowCredentials: true,
            allowOrigins: ["*"],
          },
        });

        gamesTable.grantReadData(getGameByIdFn)
        gamesTable.grantReadWriteData(newGameFn)
        gamesTable.grantReadWriteData(updateGameFn)

        TranslationTable.grantReadWriteData(getGameByIdFn)
        getGameByIdFn.addToRolePolicy(translatePolicy) // Allow Lamdba function to access AWSTranslate

        const gamesEndpoint = api.root.addResource("games");
        gamesEndpoint.addMethod(
          "POST",
          new apig.LambdaIntegration(newGameFn, { proxy: true })
        );
        gamesEndpoint.addMethod(
          "PUT",
          new apig.LambdaIntegration(updateGameFn, { proxy: true })
        );

        const gameEndpoint = gamesEndpoint.addResource("{gameId}");
        gameEndpoint.addMethod(
          "GET",
          new apig.LambdaIntegration(getGameByIdFn, { proxy: true })
        );
        
        new cdk.CfnOutput(this, "Get Game By ID API URL", {
            value: api.url + "games/{gameId}",
        });
      }
    }
    