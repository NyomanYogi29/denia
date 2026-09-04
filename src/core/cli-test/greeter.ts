export function greet(name: string, uppercase: boolean): string {
    const message = `Hello ${name}`;
    return uppercase ? message.toUpperCase() : message;
}