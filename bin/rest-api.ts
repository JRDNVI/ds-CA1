#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { GameAppApi } from "../lib/game-app-api";
import { AuthApi } from "../lib/auth-api";
import { AuthAppStack } from '../lib/auth-app-stack';

const app = new cdk.App();
// new RestAPIStack(app, "RestAPIStack", { env: { region: "eu-west-1" } });
new AuthAppStack(app, 'AuthAPIStack', { env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION }})