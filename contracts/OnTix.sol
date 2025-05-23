// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract OnTix is ERC721URIStorage, ERC721Holder, Ownable {
    
    // ========================= Constructor =============================
    constructor() ERC721("OnTix", "OTX") {}
    // ===================================================================

    // ======================== Global Variables =========================
    uint256 public nextEventId;
    uint256 public nextTicketId;
    // ===================================================================

    // ============================= Structs =============================
    struct Event {
        string name;
        string location;
        uint256 startTime;
        uint256 endTime;
        uint256 ticketPrice;
        uint256 maxTickets;
        uint256 resaleStart;
        uint256 resaleEnd;
        uint256 resalePriceCap;
        address creator;
        uint256 ticketsSold;
    }
    struct TicketData {
        uint256 eventId;
        bool isUsed;
        bool isResold;
    }
    // ====================================================================

    // ============================= Mappings =============================
    mapping(uint256 => Event) public events;
    mapping(uint256 => TicketData) public ticketMetadata;
    mapping(uint256 => uint256) public resalePrice;
    mapping(uint256 => address) public resaleSeller;
    mapping(uint256 => uint256) public eventProceeds;
    // ====================================================================

    // ============================= Events ===============================
    event EventCreated(uint256 indexed eventId, address indexed creator);
    event TicketPurchased(uint256 indexed ticketId, address indexed buyer);
    event EventProceedsWithdrawn(uint256 indexed eventId, address indexed creator, uint256 amount);
    event TicketListedForResale(uint256 indexed ticketId, uint256 price);
    event TicketResold(uint256 indexed ticketId, address from, address to);
    event TicketValidated(uint256 indexed ticketId);
    event TicketTransferred(uint256 indexed ticketId, address from, address to);
    // ====================================================================

    // ============================= Modifiers ============================
    modifier onlyTicketOwner(uint256 ticketId) {
        require(ownerOf(ticketId) == msg.sender, "Not ticket owner");
        _;
    }
    modifier resaleTimeValid(uint256 ticketId) {
        uint256 eventId = ticketMetadata[ticketId].eventId;
        require(
            block.timestamp >= events[eventId].resaleStart &&
                block.timestamp <= events[eventId].resaleEnd,
            "Resale not allowed now"
        );
        _;
    }
    modifier onlyUnsold(uint256 ticketId) {
        require(!ticketMetadata[ticketId].isResold, "Already resold once");
        _;
    }
    modifier onlyUnvalidated(uint256 ticketId) {
        require(!ticketMetadata[ticketId].isUsed, "Ticket already used");
        _;
    }
    modifier withinPriceCap(uint256 ticketId, uint256 price) {
        uint256 eventId = ticketMetadata[ticketId].eventId;
        require(price <= events[eventId].resalePriceCap, "Exceeds price cap");
        _;
    }
    modifier onlyValidEventTime(uint256 startTime, uint256 endTime) {
        require(startTime < endTime, "Invalid event time");
        _;
    }
    modifier onlyValidResaleWindow(uint256 resaleStart, uint256 resaleEnd) {
        require(resaleStart < resaleEnd, "Invalid resale window");
        _;
    }
    modifier onlyValidPriceCap(uint256 cap, uint256 price) {
        require(cap >= price, "Cap must >= ticket price");
        _;
    }
    modifier uriLengthMatches(uint256 expected, string[] memory uris) {
        require(uris.length == expected, "TokenURIs must match maxTickets");
        _;
    }
    // ====================================================================

    // ============================= Functions ============================
    function createEvent(
        string memory name,
        string memory location,
        uint256 startTime,
        uint256 endTime,
        uint256 ticketPrice,
        uint256 maxTickets,
        uint256 resaleStart,
        uint256 resaleEnd,
        uint256 resalePriceCap,
        string[] memory tokenURIs
    )
        external
        onlyValidEventTime(startTime, endTime)
        onlyValidResaleWindow(resaleStart, resaleEnd)
        onlyValidPriceCap(resalePriceCap, ticketPrice)
        uriLengthMatches(maxTickets, tokenURIs)
    {
        require(resaleEnd <= startTime, "Resale must end before event starts");
        events[nextEventId] = Event(
            name,
            location,
            startTime,
            endTime,
            ticketPrice,
            maxTickets,
            resaleStart,
            resaleEnd,
            resalePriceCap,
            msg.sender,
            0
        );

        for (uint256 i = 0; i < maxTickets; i++) {
            uint256 ticketId = nextTicketId;
            _safeMint(address(this), ticketId);
            _setTokenURI(ticketId, tokenURIs[i]);
            ticketMetadata[ticketId] = TicketData(nextEventId, false, false);
            nextTicketId++;
        }

        emit EventCreated(nextEventId, msg.sender);
        nextEventId++;
    }

    function buyTickets(uint256 eventId, uint256 quantity) external payable {
        Event storage evt = events[eventId];
        require(block.timestamp <= evt.resaleEnd, "Ticket sales period ended");
        require(
            evt.ticketsSold + quantity <= evt.maxTickets,
            "Not enough tickets"
        );
        require(
            msg.value == evt.ticketPrice * quantity,
            "Incorrect ETH amount"
        );

        uint256 ticketsAssigned = 0;

        for (
            uint256 ticketId = 0;
            ticketId < nextTicketId && ticketsAssigned < quantity;
            ticketId++
        ) {
            if (
                ownerOf(ticketId) == address(this) &&
                ticketMetadata[ticketId].eventId == eventId
            ) {
                _transfer(address(this), msg.sender, ticketId);
                emit TicketPurchased(ticketId, msg.sender);
                ticketsAssigned++;
            }
        }

        require(ticketsAssigned == quantity, "Not enough unclaimed tickets");

        evt.ticketsSold += quantity;
        eventProceeds[eventId] += msg.value;
    }

    function withdrawEventProceeds(uint256 eventId) external {
        Event storage evt = events[eventId];
        require(msg.sender == evt.creator, "Not event owner");

        uint256 balance = eventProceeds[eventId];
        require(balance > 0, "No funds to withdraw");

        eventProceeds[eventId] = 0;
        payable(msg.sender).transfer(balance);

        emit EventProceedsWithdrawn(eventId, msg.sender, balance); 
    }

    function listForResale(
        uint256 ticketId,
        uint256 price
    )
        external
        onlyTicketOwner(ticketId)
        onlyUnsold(ticketId)
        resaleTimeValid(ticketId)
        withinPriceCap(ticketId, price)
    {
        resalePrice[ticketId] = price;
        resaleSeller[ticketId] = msg.sender;

        emit TicketListedForResale(ticketId, price);
    }

    function buyResaleTickets(uint256[] memory ticketIds) external payable {
        uint256 totalPrice = 0;

        for (uint256 i = 0; i < ticketIds.length; i++) {
            uint256 ticketId = ticketIds[i];
            uint256 eventId = ticketMetadata[ticketId].eventId;

            require(
                block.timestamp <= events[eventId].resaleEnd,
                "Ticket has expired"
            );

            require(!ticketMetadata[ticketId].isResold, "Already resold");
            address seller = resaleSeller[ticketId];
            require(seller != address(0), "Not listed");
            totalPrice += resalePrice[ticketId];
        }

        require(msg.value == totalPrice, "Incorrect ETH total");

        for (uint256 i = 0; i < ticketIds.length; i++) {
            uint256 ticketId = ticketIds[i];
            address seller = resaleSeller[ticketId];
            uint256 price = resalePrice[ticketId];

            _transfer(seller, msg.sender, ticketId);
            payable(seller).transfer(price);

            ticketMetadata[ticketId].isResold = true;
            resalePrice[ticketId] = 0;
            resaleSeller[ticketId] = address(0);

            emit TicketResold(ticketId, seller, msg.sender);
        }
    }

    function transferTickets(address to, uint256[] memory ticketIds) external {
        for (uint256 i = 0; i < ticketIds.length; i++) {
            uint256 ticketId = ticketIds[i];
            require(ownerOf(ticketId) == msg.sender, "Not owner");
            require(!ticketMetadata[ticketId].isResold, "Already resold");

            uint256 eventId = ticketMetadata[ticketId].eventId;
            require(
                block.timestamp <= events[eventId].resaleEnd,
                "Ticket has expired"
            );

            _transfer(msg.sender, to, ticketId);
            ticketMetadata[ticketId].isResold = true;

            emit TicketTransferred(ticketId, msg.sender, to);
        }
    }

    function validateTicket(
        uint256 ticketId
    ) external onlyTicketOwner(ticketId) onlyUnvalidated(ticketId) {
        uint256 eventId = ticketMetadata[ticketId].eventId;
        require(
            block.timestamp <= events[eventId].endTime,
            "Ticket has expired"
        );

        ticketMetadata[ticketId].isUsed = true;

        emit TicketValidated(ticketId);
    }
    // ====================================================================

}
