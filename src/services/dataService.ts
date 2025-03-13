import { injectable } from "tsyringe";
import { User, UserSchema } from "../models/userSchema.js";

@injectable()
export class DataService {
  private baseUrl = "https://localhost:7117/api/";
  private abortTimeout = 5000;

  public async Ping(): Promise<boolean> {
    const result = await this.get<boolean>("ping");

    if (result === undefined || result === null) {
      throw new Error("Unable to reach server");
    }else{
      return result;
    }
  }

  public async GetAllUsers(): Promise<User[]> {
    const result = await this.get<User[]>("users/getall");
    
    if (result) {
      try {
        return result.map((user) => UserSchema.parse(user));
      } catch (error) {
        throw new Error("Invalid user data received from the API");
      }
    }
    throw new Error("Failed to fetch users from server");
  }
  

  private async request<TResponse>(
    endpoint: string,
    options: RequestInit
  ): Promise<TResponse | null> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        signal: this.createTimeoutSignal(this.abortTimeout),
      });

      if (!response.ok) {
        console.error(
          `${options.method} request to ${endpoint} failed with status: ${response.status}`
        );
        return null;
      }

      const data: TResponse = await response.json();
      return data;
    } catch (error) {
      console.error(`${options.method} request to ${endpoint} failed:`, error);
      return null;
    }
  }

  private async post<TRequest, TResponse>(
    endpoint: string,
    body: TRequest
  ): Promise<TResponse | null> {
    return this.request<TResponse>(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  private async get<TResponse>(endpoint: string): Promise<TResponse | null> {
    return this.request<TResponse>(endpoint, {
      method: "GET",
    });
  }

  private async put<TRequest, TResponse>(
    endpoint: string,
    body: TRequest
  ): Promise<TResponse | null> {
    return this.request<TResponse>(endpoint, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  private async delete<TResponse>(endpoint: string): Promise<TResponse | null> {
    return this.request<TResponse>(endpoint, {
      method: "DELETE",
    });
  }

  private createTimeoutSignal(timeout: number): AbortSignal {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), timeout);
    return controller.signal;
  }
}
