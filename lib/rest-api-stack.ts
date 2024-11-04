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

type AppApiProps = {
  userPoolId: string;
  userPoolClientId: string;
};

export class RestAPIStack extends Construct {
  constructor(scope: Construct, id: string, props: AppApiProps) {
    super(scope, id);

    const gamesTable = new dynamodb.Table(this, "GameTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "id", type: dynamodb.AttributeType.NUMBER },
      sortKey: { name: "title", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "Games",
    });

    const TranslationTable = new dynamodb.Table(this, "TranslationTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "title", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "lang", type: dynamodb.AttributeType.STRING },
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

    const appCommonFnProps = {
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: "handler",
      environment: {
        TABLE_NAME: gamesTable.tableName,
        USER_POOL_ID: props.userPoolId,
        CLIENT_ID: props.userPoolClientId,
        REGION: cdk.Aws.REGION,
      },
    };

    const getGameByIdFn = new lambdanode.NodejsFunction(this, "GetGameByIdFn", {
        ...appCommonFnProps,
        entry: `${__dirname}/../lambdas/getGameById.ts`,
        environment: {
          ...appCommonFnProps.environment,
          LANG_TABLE_NAME: TranslationTable.tableName,
        },
      });

      const newGameFn = new lambdanode.NodejsFunction(this, "AddGameFn", {
        ...appCommonFnProps,
        entry: `${__dirname}/../lambdas/addGame.ts`,
      });

      const updateGameFn = new lambdanode.NodejsFunction(this, "updateGameFn", {
        ...appCommonFnProps,
        entry: `${__dirname}/../lambdas/updateGame.ts`,
      });

      const authorizerFn = new lambdanode.NodejsFunction(this, "AuthorizerFn", {
        ...appCommonFnProps,
        entry: `${__dirname}/../lambdas/auth/authorizer.ts`,
      });

      const requestAuthorizer = new apig.RequestAuthorizer(
        this,
        "RequestAuthorizer",
        {
          identitySources: [apig.IdentitySource.header("cookie")],
          handler: authorizerFn,
          resultsCacheTtl: cdk.Duration.minutes(0),
        }
      );
        
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


        // Private POST and Get requests
        const gamesEndpoint = api.root.addResource("games");

        gamesEndpoint.addMethod("POST", new apig.LambdaIntegration(newGameFn, { proxy: true }), {
            authorizer: requestAuthorizer,
            authorizationType: apig.AuthorizationType.CUSTOM,
          }
        );

        gamesEndpoint.addMethod("PUT", new apig.LambdaIntegration(updateGameFn, { proxy: true }), {
            authorizer: requestAuthorizer,
            authorizationType: apig.AuthorizationType.CUSTOM,
          }
        );
    
        // Public GET request
        const gameEndpoint = gamesEndpoint.addResource("{gameId}");

        gameEndpoint.addMethod( "GET", new apig.LambdaIntegration(getGameByIdFn, { proxy: true }));
    
        new cdk.CfnOutput(this, "Get Game By ID API URL", {
          value: api.url + "games/{gameId}",
        });
      }
    }
    