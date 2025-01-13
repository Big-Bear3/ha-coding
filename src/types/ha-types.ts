export interface HAEvent<A = any, S = any> {
    a: A;
    c: string;
    lc: number;
    s: S;
}

export interface HACallData {
    id: number;
    domain: string;
    return_response: boolean;
    service: string;
    service_data: {
        [propName: string]: any;
        entity_id: string;
    };
    type: string;
}
