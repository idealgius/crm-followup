package com.gruppoautoscala.followup.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

// Configurazione base del canale WebSocket (protocollo STOMP sopra WebSocket).
// - registerStompEndpoints: definisce l'URL a cui il frontend si connette (/ws)
// - configureMessageBroker: definisce i "canali" (topic) su cui il backend
//   pubblica gli eventi e a cui il frontend si iscrive per riceverli
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // Endpoint a cui il frontend si connette: new SockJS('/ws')
        // withSockJS() = fallback automatico se il browser/rete blocca i websocket puri
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns("*")
                .withSockJS();
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        // Tutti i messaggi pubblicati su un canale che inizia per /topic
        // vengono inoltrati a tutti i client iscritti a quel canale.
        // Esempio: /topic/contacts riceve gli eventi di ContactLogController.
        registry.enableSimpleBroker("/topic");

        // Prefisso riservato per eventuali messaggi che il frontend invia
        // AL server (non ci serve ancora, ma va dichiarato per completezza
        // dell'infrastruttura STOMP).
        registry.setApplicationDestinationPrefixes("/app");
    }
}